'use client';

import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return (
    <AlertDialogPrimitive.Root
      data-slot="alert-dialog"
      {...props}
    />
  );
}

function AlertDialogTrigger({ nativeButton, ...props }: AlertDialogPrimitive.Trigger.Props) {
  // If the caller explicitly provides `nativeButton`, honor it. Otherwise,
  // attempt to detect whether the `render` prop or `children` is a native
  // <button> element (string type === 'button') or a local `Button` component.
  const renderProp = props.render ?? props.children;
  const isNativeRenderButton =
    React.isValidElement(renderProp) && typeof renderProp.type === 'string' && renderProp.type === 'button';
  const isLocalButtonComponent = React.isValidElement(renderProp) && renderProp.type === Button;

  // Honor explicit prop; otherwise only set nativeButton when the render
  // element is a raw native <button>. Do NOT auto-enable it for our local
  // `Button` component (that would cause nested <button> elements).
  const computedNativeButton = nativeButton ?? isNativeRenderButton;

  // If the trigger's children is our local `Button` component and the caller
  // didn't provide a `render` prop, explicitly use a non-button wrapper
  // element (a <div>) for the trigger. This prevents the primitive from
  // rendering an outer native <button> around the inner native <button>.
  const shouldProvideNonButtonWrapper = isLocalButtonComponent && !props.render;
  const renderWrapper = shouldProvideNonButtonWrapper ? <div data-slot="alert-dialog-trigger" /> : props.render;

  return (
    <AlertDialogPrimitive.Trigger
      // Provide a non-button wrapper when appropriate to avoid nested buttons
      {...(shouldProvideNonButtonWrapper ? { render: renderWrapper } : {})}
      data-slot="alert-dialog-trigger"
      nativeButton={computedNativeButton}
      {...props}
    />
  );
}

function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
  return (
    <AlertDialogPrimitive.Portal
      data-slot="alert-dialog-portal"
      {...props}
    />
  );
}

function AlertDialogOverlay({ className, ...props }: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 isolate z-50',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  size = 'default',
  ...props
}: AlertDialogPrimitive.Popup.Props & {
  size?: 'default' | 'sm';
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      {/*
        Full-screen invisible close target placed between the backdrop and the popup.
        This captures outside clicks and closes the AlertDialog (uses Radix/Primitive Close).
        Use nativeButton so Base UI doesn't show a runtime warning about render types.
      */}
      <AlertDialogPrimitive.Close
        data-slot="alert-dialog-outside-close"
        // Our local button is native, so set nativeButton to true to avoid mismatch warnings.
        nativeButton
        // Render a full-screen button that captures clicks but does not receive focus.
        // Prevent focus on mousedown so assistive tech won't be exposed to a focused
        // element that may be hidden from AT. No `aria-hidden` on interactive elements.
        render={
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => {
              // Prevent the browser from moving focus to this element when clicked
              e.preventDefault();
            }}
            className="absolute inset-0 z-50"
          />
        }
      />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 bg-background ring-foreground/10 gap-6 rounded-xl p-6 ring-1 duration-100 data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-lg group/alert-dialog-content fixed top-1/2 start-1/2 z-50 grid w-full -translate-x-1/2 rtl:translate-x-1/2 -translate-y-1/2 outline-none',
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        'grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-start sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogMedia({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "bg-muted mb-2 inline-flex size-16 items-center justify-center rounded-md sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        'text-lg font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        'text-muted-foreground *:[a]:hover:text-foreground text-sm text-balance md:text-pretty *:[a]:underline *:[a]:underline-offset-3',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogAction({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="alert-dialog-action"
      className={cn(className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  variant = 'outline',
  size = 'default',
  children,
  ...props
}: AlertDialogPrimitive.Close.Props &
  Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'> & { children?: React.ReactNode }) {
  const t = useTranslations('Components.AlertDialog');
  const label = children ?? t('cancel');
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      // Our local `Button` returns a native <button> element. Set
      // `nativeButton={true}` so Base UI does not emit a mismatch warning.
      nativeButton
      className={cn(className)}
      render={
        <Button
          variant={variant}
          size={size}
        >
          {label}
        </Button>
      }
      {...props}
    />
  );
}
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
