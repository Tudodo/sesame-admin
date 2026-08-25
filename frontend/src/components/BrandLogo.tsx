import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  showText = true,
  suffix,
  productName,
  productSize = "sm",
}: {
  className?: string;
  showText?: boolean;
  suffix?: string;
  productName?: string;
  productSize?: "sm" | "xl";
}) {
  return (
    <a
      href="https://swipath.com"
      target="_blank"
      rel="noreferrer"
      aria-label="顺程云创官网"
      title="顺程云创官网"
      className={cn(
        "flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80",
        className,
      )}
    >
      <svg
        viewBox="0 0 32 32"
        className="size-9 shrink-0"
        fill="none"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path
          d="M11 21.5a4 4 0 0 1-.5-7.97 5.5 5.5 0 0 1 10.6-1.18A4 4 0 0 1 22 21.5z"
          className="fill-primary-foreground/95"
        />
      </svg>
      {showText && (
        <span className="flex flex-col leading-none">
          {suffix && (
            <span className="text-[11px] font-semibold tracking-tight">
              {suffix}
            </span>
          )}
          <span
            className={cn(
              "font-semibold tracking-tight",
              suffix ? "mt-0.5 text-[12px]" : "text-[12px]",
            )}
          >
            SwiPath
          </span>
        </span>
      )}
      {showText && productName && (
        <span
          className={cn(
            "min-w-0 truncate font-semibold tracking-tight text-foreground",
            productSize === "xl" ? "text-3xl" : "text-sm",
          )}
        >
          {productName}
        </span>
      )}
    </a>
  );
}
