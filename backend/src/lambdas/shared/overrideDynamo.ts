import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import type { CourseDateOverride } from "@yogaswap/shared";

export function mapStringList(attr: AttributeValue | undefined): string[] {
  return attr?.L ? attr.L.map((entry) => entry.S!).filter(Boolean) : [];
}

function mapAnonymousTrialCount(attr: AttributeValue | undefined): number | undefined {
  if (!attr?.N) return undefined;
  const parsed = Number.parseInt(attr.N, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

export function mapOverrideItem(item: Record<string, AttributeValue>): CourseDateOverride {
  const anonymousTrialCount = mapAnonymousTrialCount(item.anonymousTrialCount);
  return {
    courseId: Number(item.courseId.S!),
    ...(item.courseUid?.S ? { courseUid: item.courseUid.S } : {}),
    date: item.date.S!,
    participants: mapStringList(item.participants),
    swapped: mapStringList(item.swapped),
    waitlist: mapStringList(item.waitlist),
    shortNoticeCancellations: mapStringList(item.shortNoticeCancellations),
    ...(anonymousTrialCount !== undefined && anonymousTrialCount > 0
      ? { anonymousTrialCount }
      : {}),
  };
}

export function anonymousTrialCountAttribute(count: number): AttributeValue {
  return { N: String(count) };
}

export function stringListAttribute(values: string[]): AttributeValue {
  return { L: values.map((v) => ({ S: v })) };
}
