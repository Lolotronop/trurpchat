<script lang="ts">
  import type { Snippet } from "svelte";
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import Item from "$lib/components/ui/context-menu/context-menu-item.svelte";
  import { cn } from "$lib/utils.js";

  type Props = ContextMenuPrimitive.ItemProps & {
    children?: Snippet;
    inset?: boolean;
    variant?: "default" | "destructive";
    nofocus?: boolean;
  };

  let {
    ref = $bindable(null),
    class: className,
    inset,
    variant = "default",
    nofocus = false,
    children,
    onpointerdown,
    onclick,
    onSelect,
    closeOnSelect = true,
    ...restProps
  }: Props = $props();

  const buttonProps = $derived(restProps as Record<string, unknown>);

  function closeContextMenu(event: MouseEvent) {
    const content = (event.currentTarget as HTMLElement | null)?.closest(
      '[data-slot="context-menu-content"]',
    );

    content?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  function handleClick(event: MouseEvent) {
    (onclick as ((event: MouseEvent) => void) | undefined)?.(event);

    if (event.defaultPrevented) {
      return;
    }

    const selectEvent = new CustomEvent("menuitemselect", {
      bubbles: true,
      cancelable: true,
    });
    onSelect?.(selectEvent);

    if (!selectEvent.defaultPrevented && closeOnSelect) {
      closeContextMenu(event);
    }
  }

  function handlePointerDown(event: PointerEvent) {
    event.preventDefault();
    (onpointerdown as ((event: PointerEvent) => void) | undefined)?.(event);
  }
</script>

{#if nofocus}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    bind:this={ref}
    data-slot="context-menu-item"
    data-disabled={restProps.disabled ? "" : undefined}
    data-inset={inset}
    data-variant={variant}
    tabindex={-1}
    class={cn(
      "data-highlighted:bg-accent/20 data-highlighted:text-accent-foreground hover:bg-accent/20 hover:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:hover:bg-destructive/10 dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 dark:data-[variant=destructive]:hover:bg-destructive/20 data-[variant=destructive]:data-highlighted:text-destructive data-[variant=destructive]:hover:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground outline-hidden relative flex justify-between cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[disabled]:pointer-events-none data-[inset]:pl-8 data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 w-full",
      className,
    )}
    onpointerdown={handlePointerDown}
    onclick={handleClick}
    {...buttonProps}
  >
    {@render children?.()}
  </div>
{:else}
  <Item
    bind:ref
    class={className}
    {inset}
    {variant}
    {onpointerdown}
    {onclick}
    {onSelect}
    {closeOnSelect}
    {...restProps}
  >
    {@render children?.()}
  </Item>
{/if}
