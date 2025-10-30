import * as React from 'react'
import { cn } from '@/lib/utils'

// Minimal local replacement for Radix's Slot component.
// Behavior: expects a single child element and clones it, merging incoming
// props and className (so `asChild` usage in Button continues to work).
function Slot({ children, className, ...props }: any) {
  const child = React.Children.only(children) as React.ReactElement<any>
  return React.cloneElement(child, {
    ...props,
    className: cn((child.props as any)?.className, className),
  })
}

const _buttonBase =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"

const _buttonVariantMap: Record<string, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive:
    'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
  outline:
    'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
  link: 'text-primary underline-offset-4 hover:underline',
}

const _buttonSizeMap: Record<string, string> = {
  default: 'h-9 px-4 py-2 has-[>svg]:px-3',
  sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
  lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
  icon: 'size-9',
  'icon-sm': 'size-8',
  'icon-lg': 'size-10',
}

type ButtonVariant = keyof typeof _buttonVariantMap
type ButtonSize = keyof typeof _buttonSizeMap

function buttonVariants(opts?: { variant?: ButtonVariant; size?: ButtonSize; className?: string }) {
  const variant = opts?.variant ?? 'default'
  const size = opts?.size ?? 'default'
  return cn(_buttonBase, _buttonVariantMap[variant], _buttonSizeMap[size], opts?.className)
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
}) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
