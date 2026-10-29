"use client";

// Two-level category drawer: categories -> subcategories with a back arrow.
// Radix Dialog (via Sheet) provides the focus trap, Escape to close and focus return.
import Link from "next/link";
import { createContext, useContext, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, Menu, MessageCircle, X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { Category } from "@/types/catalog";
import { CategoryIcon } from "./category-icon";

export type DrawerCategory = Pick<Category, "id" | "slug" | "name" | "icon"> & {
  children: Pick<Category, "id" | "slug" | "name" | "icon">[];
};

type DrawerContextValue = { open: boolean; contentId: string; openFrom: (trigger: HTMLElement) => void };
const DrawerContext = createContext<DrawerContextValue | null>(null);

const rowClass =
  "flex min-h-12 w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-body-lg font-semibold text-foreground hover:bg-surface-low focus-visible:-outline-offset-2";

export function CategoryDrawerProvider({
  categories,
  whatsappHref,
  phone,
  children,
}: {
  categories: DrawerCategory[];
  whatsappHref: string;
  phone: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const parentRefs = useRef(new Map<string, HTMLButtonElement>());
  // Triggers live outside Radix (header and tab bar), so focus is returned to them by hand.
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentId = useId();
  const levelTitleId = useId();

  const active = categories.find((c) => c.id === activeId) ?? null;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setActiveId(null);
  }

  function showChildren(id: string) {
    setActiveId(id);
    requestAnimationFrame(() => backRef.current?.focus());
  }

  function showParents() {
    const previous = activeId;
    setActiveId(null);
    requestAnimationFrame(() => previous && parentRefs.current.get(previous)?.focus());
  }

  const close = () => onOpenChange(false);

  return (
    <DrawerContext.Provider
      value={{
        open,
        contentId,
        openFrom(trigger) {
          triggerRef.current = trigger;
          setOpen(true);
        },
      }}
    >
      {children}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          id={contentId}
          side="left"
          showCloseButton={false}
          className="w-full gap-0 p-0 sm:max-w-sm"
          onCloseAutoFocus={(e) => {
            // Return focus to whichever button (header or tab bar) opened the drawer.
            if (triggerRef.current?.isConnected) {
              e.preventDefault();
              triggerRef.current.focus();
            }
          }}
        >
          <SheetDescription className="sr-only">Browse products by category</SheetDescription>
          {active ? (
            <>
              <div className="flex h-16 items-center gap-2 border-b border-border px-2">
                <button
                  ref={backRef}
                  type="button"
                  onClick={showParents}
                  className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-surface-low"
                  aria-label="Back to all categories"
                  aria-describedby={levelTitleId}
                >
                  <ArrowLeft className="size-5" aria-hidden="true" />
                </button>
                <SheetTitle id={levelTitleId} className="flex-1 font-display text-headline-sm">
                  {active.name}
                </SheetTitle>
                <CloseButton />
              </div>
              <nav aria-label={`${active.name} subcategories`} className="flex-1 overflow-y-auto">
                <ul>
                  <li className="p-3">
                    <Link
                      href={`/categories/${active.slug}`}
                      onClick={close}
                      className="flex min-h-14 items-center justify-between gap-3 rounded-lg bg-primary px-4 py-3 text-body-lg font-bold text-primary-foreground hover:bg-brand-hover"
                    >
                      View all {active.name}
                      <span className="flex size-9 items-center justify-center rounded-full bg-primary-foreground/15">
                        <ArrowRight className="size-5" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                  {active.children.map((child) => (
                    <li key={child.id}>
                      <Link href={`/categories/${active.slug}/${child.slug}`} onClick={close} className={rowClass}>
                        <span className="flex size-9 items-center justify-center rounded-lg bg-surface-container text-primary">
                          <CategoryIcon name={child.icon} className="size-5" />
                        </span>
                        <span className="flex-1">{child.name}</span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </>
          ) : (
            <>
              <div className="flex h-16 items-center gap-2 border-b border-border px-4">
                <Menu className="size-5" aria-hidden="true" />
                <SheetTitle className="flex-1 font-display text-headline-sm">All Categories</SheetTitle>
                <CloseButton />
              </div>
              <nav aria-label="All categories" className="flex-1 overflow-y-auto">
                <ul>
                  {categories.map((cat) => {
                    const inner = (
                      <>
                        <span className="flex size-9 items-center justify-center rounded-lg bg-surface-container text-primary">
                          <CategoryIcon name={cat.icon} className="size-5" />
                        </span>
                        <span className="flex-1">{cat.name}</span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                      </>
                    );
                    return (
                      <li key={cat.id}>
                        {cat.children.length > 0 ? (
                          <button
                            type="button"
                            ref={(el) => {
                              if (el) parentRefs.current.set(cat.id, el);
                            }}
                            onClick={() => showChildren(cat.id)}
                            className={rowClass}
                            aria-label={`${cat.name}, show subcategories`}
                          >
                            {inner}
                          </button>
                        ) : (
                          <Link href={`/categories/${cat.slug}`} onClick={close} className={rowClass}>
                            {inner}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </>
          )}
          <div className="border-t border-border p-4">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center gap-3 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-brand-hover"
            >
              <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
              <span className="flex-1 text-label-lg">
                Contact us on WhatsApp
                <span className="block text-body-sm font-normal tabular">{phone}</span>
              </span>
              <span className="sr-only">(opens WhatsApp in a new tab)</span>
            </a>
          </div>
        </SheetContent>
      </Sheet>
    </DrawerContext.Provider>
  );
}

function CloseButton() {
  return (
    <SheetClose
      className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-surface-low"
      aria-label="Close categories"
    >
      <X className="size-5" aria-hidden="true" />
    </SheetClose>
  );
}

export function CategoryDrawerTrigger({ className, children }: { className?: string; children: React.ReactNode }) {
  const drawer = useContext(DrawerContext);
  if (!drawer) throw new Error("CategoryDrawerTrigger must be used inside <CategoryDrawerProvider>");
  return (
    <button
      type="button"
      onClick={(e) => drawer.openFrom(e.currentTarget)}
      aria-haspopup="dialog"
      aria-expanded={drawer.open}
      aria-controls={drawer.open ? drawer.contentId : undefined}
      className={className}
    >
      {children}
    </button>
  );
}
