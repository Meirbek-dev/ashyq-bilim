"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  BookCopy,
  Menu,
  Signpost,
  SquareLibrary,
  type LucideIcon,
} from "lucide-react";

// Components & UI
import Link from "@components/ui/AppLink";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SearchBar } from "@/components/Objects/Search/SearchBar";
import { LocaleSwitcher } from "@/components/Utils/LocaleSwitcher";
import { HeaderProfileBox } from "@/components/Security/HeaderProfileBox";

// Hooks & Config
import { useSession } from "@/hooks/useSession";
import { getAbsoluteUrl } from "@/services/config/config";
import { NAVBAR_HEIGHT } from "@/lib/constants";
import { cn } from "@/lib/utils";

// Assets
import platformLogoFull from "@public/platform_logo_full.svg";

type NavLinkType = "courses" | "collections" | "trail";

interface NavLinkDef {
  type: NavLinkType;
  href: string;
  icon: LucideIcon;
  authRequired?: boolean;
}

const NAV_LINKS: NavLinkDef[] = [
  { type: "courses", href: "/courses", icon: BookCopy },
  { type: "collections", href: "/collections", icon: SquareLibrary },
  { type: "trail", href: "/trail", icon: Signpost, authRequired: true },
];

const SCROLL_THRESHOLD = 8;

// ----------------------------------------------------------------------
// Shared hook: active path match
// ----------------------------------------------------------------------
function useIsActive(href: string) {
  const pathname = usePathname();
  return useMemo(() => {
    if (!pathname) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
  }, [pathname, href]);
}

// ----------------------------------------------------------------------
// Desktop Link — lives inside NavigationMenu context
// ----------------------------------------------------------------------
interface NavLinkProps {
  def: NavLinkDef;
  label: string;
  onNavigate?: () => void;
}

const DesktopNavLink = ({ def, label }: NavLinkProps) => {
  const { icon: Icon, href } = def;
  const isActive = useIsActive(href);

  return (
    <NavigationMenuItem className="list-none">
      <Link
        prefetch={false}
        href={getAbsoluteUrl(href)}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group relative flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring",
          isActive
            ? "text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <Icon
          size={16}
          className={cn(
            "shrink-0 transition-colors",
            isActive
              ? "text-foreground"
              : "text-muted-foreground group-hover:text-accent-foreground",
          )}
        />
        <span>{label}</span>
        {isActive && (
          <span
            aria-hidden
            className="absolute inset-x-3 -bottom-2 h-0.5 rounded-full bg-primary"
          />
        )}
      </Link>
    </NavigationMenuItem>
  );
};

// ----------------------------------------------------------------------
// Mobile Link — plain list item inside the Sheet
// ----------------------------------------------------------------------
const MobileNavLink = ({ def, label, onNavigate }: NavLinkProps) => {
  const { icon: Icon, href } = def;
  const isActive = useIsActive(href);

  return (
    <Link
      prefetch={false}
      href={getAbsoluteUrl(href)}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
      )}
    >
      <Icon size={18} className="shrink-0" />
      <span className={cn("flex-1", isActive && "font-semibold")}>{label}</span>
    </Link>
  );
};

// ----------------------------------------------------------------------
// Focus Mode (activity pages)
// ----------------------------------------------------------------------
function useFocusMode(enabled: boolean) {
  const [isFocusMode, setIsFocusMode] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsFocusMode(false);
      return;
    }

    const read = () => {
      try {
        return localStorage.getItem("globalFocusMode") === "true";
      } catch {
        return false;
      }
    };

    setIsFocusMode(read());

    const sync = () => setIsFocusMode(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "globalFocusMode") sync();
    };

    globalThis.addEventListener("storage", onStorage);
    globalThis.addEventListener("focusModeChange", sync as EventListener);

    return () => {
      globalThis.removeEventListener("storage", onStorage);
      globalThis.removeEventListener("focusModeChange", sync as EventListener);
    };
  }, [enabled]);

  return isFocusMode;
}

// ----------------------------------------------------------------------
// Scroll elevation — only updates state on threshold crossing
// ----------------------------------------------------------------------
function useScrollElevation(threshold = SCROLL_THRESHOLD) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let rafId = 0;

    const update = () => {
      rafId = 0;
      const scrolled = window.scrollY > threshold;
      setIsScrolled((prev) => (prev === scrolled ? prev : scrolled));
    };

    const onScroll = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId !== 0) cancelAnimationFrame(rafId);
    };
  }, [threshold]);

  return isScrolled;
}

// ----------------------------------------------------------------------
// Main Navigation Bar
// ----------------------------------------------------------------------
export default function NavBar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("Components.NavMenu");
  const tLinks = useTranslations("Components.NavMenuLinks");
  const { isAuthenticated } = useSession();

  const isOnActivityPage = pathname?.includes("/activity/") ?? false;
  const isFocusMode = useFocusMode(isOnActivityPage);
  const isScrolled = useScrollElevation();

  const visibleLinks = useMemo(
    () => NAV_LINKS.filter((l) => !l.authRequired || isAuthenticated),
    [isAuthenticated],
  );

  // Close sheet on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  if (isOnActivityPage && isFocusMode) return null;

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 w-full border-b transition-[background-color,border-color,box-shadow] duration-200",
        isScrolled
          ? "border-border/60 bg-background/85 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/70"
          : "border-transparent bg-background",
      )}
      style={{ height: NAVBAR_HEIGHT }}
    >
      <div className="mx-auto flex h-full w-full items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: Logo + Desktop Links */}
        <div className="flex min-w-0 items-center gap-6 lg:gap-8">
          <Link
            href={getAbsoluteUrl("/")}
            aria-label={t("logoAlt")}
            className="flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src={platformLogoFull}
              alt={t("logoAlt")}
              width={100}
              height={32}
              className="h-8 w-auto object-contain"
              priority
              loading="eager"
            />
          </Link>

          <nav aria-label={t("navigation")} className="hidden md:flex">
            <NavigationMenu>
              <NavigationMenuList className="gap-1">
                {visibleLinks.map((def) => (
                  <DesktopNavLink
                    key={def.type}
                    def={def}
                    label={tLinks(def.type)}
                  />
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </nav>
        </div>

        {/* Center: Desktop Search */}
        <div className="hidden flex-1 justify-center lg:flex">
          <SearchBar className="w-full max-w-md" />
        </div>

        {/* Spacer for md screens where search is hidden */}
        <div className="flex-1 lg:hidden" />

        {/* Right: Controls & Mobile Trigger */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="hidden sm:flex">
            <LocaleSwitcher />
          </div>

          <div className="hidden md:flex">
            <HeaderProfileBox />
          </div>

          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger
              render={(triggerProps) => (
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label={t("openMenu")}
                  {...triggerProps}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}
            />

            <SheetContent
              side="right"
              className="flex w-full flex-col gap-0 p-0 sm:max-w-sm"
            >
              <SheetHeader className="border-b border-border/60 px-6 py-4">
                <SheetTitle className="sr-only">{t("navigation")}</SheetTitle>
                <Image
                  src={platformLogoFull}
                  alt={t("logoAlt")}
                  width={90}
                  height={28}
                  className="h-7 w-auto object-contain"
                />
              </SheetHeader>

              <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
                <section className="space-y-2">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("search")}
                  </Label>
                  <SearchBar isMobile className="w-full" />
                </section>

                <section className="space-y-2">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("navigation")}
                  </Label>
                  <nav
                    aria-label={t("navigation")}
                    className="flex flex-col gap-0.5"
                  >
                    {visibleLinks.map((def) => (
                      <MobileNavLink
                        key={def.type}
                        def={def}
                        label={tLinks(def.type)}
                        onNavigate={closeMenu}
                      />
                    ))}
                  </nav>
                </section>

                <section className="space-y-2 sm:hidden">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("language")}
                  </Label>
                  <LocaleSwitcher className="w-full" isMobile />
                </section>
              </div>

              <div className="mt-auto border-t border-border/60 bg-muted/30 px-6 py-4">
                <Label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("account")}
                </Label>
                <div className="flex items-center justify-center rounded-lg border border-border/60 bg-background p-3">
                  <HeaderProfileBox />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
