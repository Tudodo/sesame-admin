import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { THEME_PRESETS } from "@/lib/theme";
import { useTheme } from "@/theme/AppThemeProvider";
import { CircleCheck, Palette } from "lucide-react";

export function ThemeSwitcher() {
  const { themePreset, setThemePreset } = useTheme();

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="切换主题">
              <Palette className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>切换主题</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {THEME_PRESETS.map((theme) => (
          <DropdownMenuItem
            key={theme.id}
            onClick={() => setThemePreset(theme.id)}
          >
            {themePreset === theme.id ? (
              <CircleCheck className="size-4 text-primary" />
            ) : (
              <span className="size-4" />
            )}
            <span>{theme.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
