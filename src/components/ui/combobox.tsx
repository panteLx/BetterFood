"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const Combobox = ComboboxPrimitive.Root

function ComboboxInputGroup({ className, ...props }: ComboboxPrimitive.InputGroup.Props) {
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="combobox-input-group"
      className={cn(
        "relative flex h-9 w-full items-center rounded-lg bg-card shadow-row focus-within:ring-3 focus-within:ring-ring/50",
        className
      )}
      {...props}
    />
  )
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "h-full w-full min-w-0 rounded-lg bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function ComboboxPortal(props: ComboboxPrimitive.Portal.Props) {
  return <ComboboxPrimitive.Portal data-slot="combobox-portal" {...props} />
}

function ComboboxPositioner({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  ...props
}: ComboboxPrimitive.Positioner.Props) {
  return (
    <ComboboxPrimitive.Positioner
      data-slot="combobox-positioner"
      side={side}
      sideOffset={sideOffset}
      align={align}
      className={cn("isolate z-50", className)}
      {...props}
    />
  )
}

function ComboboxPopup({ className, ...props }: ComboboxPrimitive.Popup.Props) {
  return (
    <ComboboxPrimitive.Popup
      data-slot="combobox-popup"
      className={cn(
        "relative isolate z-50 max-h-80 w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-[20px] bg-popover text-popover-foreground shadow-card duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      {...props}
    />
  )
}

function ComboboxStatus({ className, ...props }: ComboboxPrimitive.Status.Props) {
  return (
    <ComboboxPrimitive.Status
      data-slot="combobox-status"
      className={cn("px-2.5 py-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn("px-2.5 py-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function ComboboxList(props: ComboboxPrimitive.List.Props) {
  return <ComboboxPrimitive.List data-slot="combobox-list" className="p-1" {...props} />
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-2 pl-7 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        className
      )}
      {...props}
    >
      <ComboboxPrimitive.ItemIndicator className="absolute left-2 flex size-4 items-center justify-center">
        <CheckIcon className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
      {children}
    </ComboboxPrimitive.Item>
  )
}

export {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxPopup,
  ComboboxStatus,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
}
