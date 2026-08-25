import { BrandLogo } from "@/components/BrandLogo";
import type React from "react";

export function AuthShell({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="glow-bg relative min-h-screen overflow-hidden bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "52px 52px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at center, black 20%, transparent 76%)",
        }}
      />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className={compact ? "w-full max-w-sm" : "w-full max-w-md"}>
          <div className="mb-7 flex justify-center">
            <BrandLogo
              suffix="顺程云创"
              productName="Sesame Admin"
              productSize="xl"
            />
          </div>
          <div className="console-surface relative overflow-hidden rounded-3xl p-7 sm:p-9">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
