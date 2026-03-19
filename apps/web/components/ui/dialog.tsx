'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      {...props}
    />
  );
}

function DialogTrigger({ nativeButton, ...props }: DialogPrimitive.Trigger.Props) {
  // If the caller explicitly provides `nativeButton`, honor it. Otherwise,
  // attempt to detect whether the `render` prop is a native <button> element
  // or our local `Button` component (which returns a <button>). We compute
  // this to avoid Base UI runtime warnings about mismatches.
  const renderProp = props.render;
  const isNativeRenderButton =
    React.isValidElement(renderProp) && typeof renderProp.type === 'string' && renderProp.type === 'button';
  const isLocalButtonComponent = React.isValidElement(renderProp) && renderProp.type === Button;
  const computedNativeButton = nativeButton ?? (isNativeRenderButton || isLocalButtonComponent);

  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      nativeButton={computedNativeButton}
      {...props}
    />
  );
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return (
    <DialogPrimitive.Portal
      data-slot="dialog-portal"
      {...props}
    />
  );
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      // The render prop typically receives our `Button` component which
      // ultimately renders a native <button> element; ensure Base UI knows
      // this by marking `nativeButton={true}` to avoid a mismatch warning.
      nativeButton
      {...props}
    />
  );
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 isolate z-50',
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
}) {
  const t = useTranslations('Components.Dialog');
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'bg-background data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ring-foreground/10 grid max-w-[calc(100%-2rem)] gap-6 rounded-xl p-6 text-sm ring-1 duration-100 sm:max-w-md fixed top-1/2 start-1/2 z-50 w-full -translate-x-1/2 rtl:translate-x-1/2 -translate-y-1/2 outline-none',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            // Our `Button` component renders a native <button>, so tell
            // Base UI it is a native button to avoid the runtime warning.
            nativeButton
            render={
              <Button
                variant="ghost"
                className="absolute end-4 top-4"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">{t('close')}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('gap-2 flex flex-col text-xl', className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean;
}) {
  const t = useTranslations('Components.Dialog');
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close
          render={<Button variant="outline" />}
          // Our `Button` renders a native <button>, ensure Base UI knows
          // to avoid the runtime mismatch warning.
          nativeButton
        >
          {t('close')}
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('leading-none font-medium', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3',
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
