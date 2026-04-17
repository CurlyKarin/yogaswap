import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { getTenantContext } from "../shared/tenantContext";
import { dynamoClient } from "../shared/dynamoClient";

const client = dynamoClient;
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Sunday: 0,
  Mon: 1,
  Monday: 1,
  Tue: 2,
  Tuesday: 2,
  Wed: 3,
  Wednesday: 3,
  Thu: 4,
  Thursday: 4,
  Fri: 5,
  Friday: 5,
  Sat: 6,
  Saturday: 6,
};

function parseDateOnlyUtc(value: string | undefined): Date | null {
  if (!value || !ISO_DATE_ONLY.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDaysUtc(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function intersectWindow(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
): { start: Date; end: Date } | null {
  const start = leftStart > rightStart ? leftStart : rightStart;
  const end = leftEnd < rightEnd ? leftEnd : rightEnd;
  if (start > end) return null;
  return { start, end };
}

function generateWeekdayDates(start: Date, end: Date, weekdayIndex: number): string[] {
  const result: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDaysUtc(cursor, 1)) {
    if (cursor.getUTCDay() === weekdayIndex) {
      result.push(toDateOnlyUtc(cursor));
    }
  }
  return result;
}

function normalizeDateList(values: string[]): string[] {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => !!value && ISO_DATE_ONLY.test(value))
    .sort((a, b) => a.localeCompare(b));
}

function deriveVisibleDates(input: {
  planningMode?: string;
  visibilityMode?: string;
  weekday: string;
  seriesStartDate?: string;
  seriesEndDate?: string;
  visibleFrom?: string;
  visibleUntil?: string;
  visibilityHorizonWeeks?: number;
  excludedDates: string[];
  includedDates: string[];
  fallbackDates: string[];
  now?: Date;
}): string[] {
  const fallbackDates = normalizeDateList(input.fallbackDates);
  const planningMode = input.planningMode;
  const weekdayIndex = WEEKDAY_INDEX[input.weekday];
  if (!planningMode || weekdayIndex == null) return fallbackDates;

  const now = input.now ?? new Date();
  const todayUtc = startOfTodayUtc(now);

  let baseWindowStart: Date | null = null;
  let baseWindowEnd: Date | null = null;

  if (planningMode === "bounded_series") {
    const seriesStart = parseDateOnlyUtc(input.seriesStartDate);
    const seriesEnd = parseDateOnlyUtc(input.seriesEndDate);
    if (!seriesStart || !seriesEnd) return fallbackDates;
    baseWindowStart = seriesStart;
    baseWindowEnd = seriesEnd;
  } else if (planningMode === "rolling_continuous") {
    const horizonWeeks =
      Number.isInteger(input.visibilityHorizonWeeks) && (input.visibilityHorizonWeeks ?? 0) > 0
        ? Number(input.visibilityHorizonWeeks)
        : 8;
    baseWindowStart = todayUtc;
    baseWindowEnd = addDaysUtc(todayUtc, horizonWeeks * 7);
  } else {
    return fallbackDates;
  }

  let finalWindowStart = baseWindowStart;
  let finalWindowEnd = baseWindowEnd;

  if (input.visibilityMode === "fixed_window") {
    const fixedStart = parseDateOnlyUtc(input.visibleFrom);
    const fixedEnd = parseDateOnlyUtc(input.visibleUntil);
    if (fixedStart && fixedEnd) {
      const overlap = intersectWindow(baseWindowStart, baseWindowEnd, fixedStart, fixedEnd);
      if (!overlap) return [];
      finalWindowStart = overlap.start;
      finalWindowEnd = overlap.end;
    }
  }

  const generated = generateWeekdayDates(finalWindowStart, finalWindowEnd, weekdayIndex);
  const excluded = new Set(normalizeDateList(input.excludedDates));
  const included = normalizeDateList(input.includedDates);
  const visibleSet = new Set(generated.filter((date) => !excluded.has(date)));
  for (const includeDate of included) {
    const includeUtc = parseDateOnlyUtc(includeDate);
    if (!includeUtc) continue;
    if (includeUtc >= finalWindowStart && includeUtc <= finalWindowEnd && !excluded.has(includeDate)) {
      visibleSet.add(includeDate);
    }
  }

  return Array.from(visibleSet).sort((a, b) => a.localeCompare(b));
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const tableName = process.env.COURSES_TABLE;

  if (!tableName) {
    console.error("COURSES_TABLE env var is not set");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "COURSES_TABLE env var is not set" }),
    };
  }

  try {
    const { tenantId, userId } = getTenantContext(event);
    console.log('getCourses tenant context', { tenantId, userId });

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "tenantId = :tid", // :tid = Platzhalter für tenantId (PK)
        ExpressionAttributeValues: { ":tid": { S: tenantId } },
        ConsistentRead: true,
      }),
    );

    const items = result.Items || [];
    if (items.length === 0) {
      console.log(
        "getCourses: Query returned 0 items for tenantId=",
        tenantId,
      );
    }
    const courses = items.map((item) => {
      const fallbackDates = item.dates?.L ? item.dates.L.map((d: any) => d.S).filter(Boolean) : [];
      const excludedDates = item.excludedDates?.L
        ? item.excludedDates.L.map((d: any) => d.S).filter(Boolean)
        : [];
      const includedDates = item.includedDates?.L
        ? item.includedDates.L.map((d: any) => d.S).filter(Boolean)
        : [];
      const planningMode = item.planningMode?.S;
      const visibilityMode = item.visibilityMode?.S;
      const visibleDates = deriveVisibleDates({
        planningMode,
        visibilityMode,
        weekday: item.weekday?.S ?? "",
        seriesStartDate: item.seriesStartDate?.S,
        seriesEndDate: item.seriesEndDate?.S,
        visibleFrom: item.visibleFrom?.S,
        visibleUntil: item.visibleUntil?.S,
        visibilityHorizonWeeks: item.visibilityHorizonWeeks?.N
          ? Number(item.visibilityHorizonWeeks.N)
          : undefined,
        excludedDates,
        includedDates,
        fallbackDates,
      });

      return {
        id: Number(item.id?.N ?? item.courseId?.S ?? 0),
        courseId: item.courseId?.S,
        name: item.name.S!,
        weekday: item.weekday.S!,
        time: item.time.S!,
        capacity: Number(item.capacity.N!),
        status: item.status?.S ?? "active",
        planningMode,
        visibilityMode,
        seriesStartDate: item.seriesStartDate?.S,
        seriesEndDate: item.seriesEndDate?.S,
        visibleFrom: item.visibleFrom?.S,
        visibleUntil: item.visibleUntil?.S,
        visibilityHorizonWeeks: item.visibilityHorizonWeeks?.N
          ? Number(item.visibilityHorizonWeeks.N)
          : undefined,
        excludedDates,
        includedDates,
        visibleDates,
        participants: item.participants.L ? item.participants.L.map((p: any) => p.S) : [],
        dates: visibleDates,
      };
    });

    return { statusCode: 200, body: JSON.stringify(courses) };
  } catch (error) {
    console.error('Error getting courses:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to get courses' }) };
  }
};