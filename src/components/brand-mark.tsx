import Image from "next/image";
import { BRAND_MARK_PATH, PRODUCT_NAME } from "@/lib/brand";

export function BrandMark({ className = "size-10" }: { className?: string }) {
  return (
    <Image
      src={BRAND_MARK_PATH}
      width={1024}
      height={1024}
      unoptimized
      className={className}
      alt={`${PRODUCT_NAME} logo`}
      data-brand-mark
    />
  );
}
