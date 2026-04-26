'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { useTheme } from '@/components/providers/theme-provider';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, Shuffle } from 'lucide-react';

interface ThemeSelectorProps {
  className?: string;
}

const ColorBox = ({ color }: { color: string }) => (
  <div
    className="border-border h-3 w-3 rounded-sm border"
    style={{ backgroundColor: color }}
  />
);

const ThemeColors = ({ colors }: { colors: { primary: string; secondary: string; accent: string; background: string } }) => (
  <div className="flex gap-0.5">
    <ColorBox color={colors.primary} />
    <ColorBox color={colors.secondary} />
    <ColorBox color={colors.accent} />
    <ColorBox color={colors.background} />
  </div>
);

export function ThemeSelector({ className }: ThemeSelectorProps) {
  const { theme: currentTheme, themes, setTheme } = useTheme();
  const t = useTranslations('DashPage.UserAccountSettings.generalSection.themeSelector');
  const tThemes = useTranslations('Themes');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filteredThemes = useMemo(() => {
    if (!search.trim()) return [...themes];
    const lower = search.toLowerCase();
    return themes.filter((theme) =>
      tThemes(`${theme.name}.name`).toLowerCase().includes(lower),
    );
  }, [themes, search, tThemes]);

  const randomize = useCallback(() => {
    const random = Math.floor(Math.random() * themes.length);
    setTheme(themes[random].name);
  }, [themes, setTheme]);

  return (
    <div className={cn('space-y-2', className)}>
      <Label className="text-base font-medium">{t('title')}</Label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            'inline-flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[300px]',
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <ThemeColors colors={currentTheme.colors} />
            <span className="truncate">{tThemes(`${currentTheme.name}.name`)}</span>
          </div>
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        </PopoverTrigger>

        <PopoverContent
          className="min-w-[var(--anchor-width)] w-[300px] sm:w-[360px] p-0"
          align="start"
          sideOffset={4}
        >
          <Command>
            <CommandInput
              placeholder={t('searchPlaceholder')}
              value={search}
              onValueChange={setSearch}
            />

            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-muted-foreground text-sm">
                {t('themeCount', { count: filteredThemes.length })}
              </span>
              <button
                type="button"
                onClick={randomize}
                title={t('randomButtonTitle')}
                className="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1 transition-colors"
              >
                <Shuffle className="size-3.5" />
              </button>
            </div>

            <Separator />

            <CommandList className="max-h-[320px]">
              <CommandEmpty>{t('noThemesFound')}</CommandEmpty>
              <CommandGroup>
                {filteredThemes.map((theme) => (
                  <CommandItem
                    key={theme.name}
                    value={theme.name}
                    onSelect={() => {
                      setTheme(theme.name);
                      setSearch('');
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 py-2"
                  >
                    <ThemeColors colors={theme.colors} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">
                        {tThemes(`${theme.name}.name`)}
                      </span>
                      <span className="text-muted-foreground line-clamp-1 text-xs">
                        {tThemes(`${theme.name}.description`)}
                      </span>
                    </div>
                    {theme.name === currentTheme.name && (
                      <Check className="size-4 shrink-0 opacity-70" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <p className="text-muted-foreground text-xs">
        {tThemes(`${currentTheme.name}.description`)}
      </p>
    </div>
  );
}
