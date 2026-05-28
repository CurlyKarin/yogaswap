import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import type { CourseDateOverride } from "@yogaswap/shared";

export function mapStringList(attr: AttributeValue | undefined): string[] {
  return attr?.L ? attr.L.map((entry) => entry.S!).filter(Boolean) : [];
}

export function mapOverrideItem(item: Record<string, AttributeValue>): CourseDateOverride {
  return {
    courseId: Number(item.courseId.S!),
    ...(item.courseUid?.S ? { courseUid: item.courseUid.S } : {}),
    date: item.date.S!,
    participants: mapStringList(item.participants),
    swapped: mapStringList(item.swapped),
    waitlist: mapStringList(item.waitlist),
    shortNoticeCancellations: mapStringList(item.shortNoticeCancellations),
  };
}

export function stringListAttribute(values: string[]): AttributeValue {
  return { L: values.map((v) => ({ S: v })) };
}
