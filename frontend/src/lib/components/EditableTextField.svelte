<script lang="ts">
  import { Pencil, Save, X } from "@lucide/svelte";
  import { tick } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";

  type Props = {
    label: string;
    value: string | null | undefined;
    placeholder?: string;
    onSave: (
      value: string | null,
    ) => boolean | Promise<boolean | undefined> | undefined;
  };

  let { label, value, placeholder = label, onSave }: Props = $props();

  let editing = $state(false);
  let draft = $derived(value ?? "");
  let input = $state<HTMLInputElement | null>(null);

  async function startEditing() {
    editing = true;
    await tick();
    input?.focus();
  }

  async function save() {
    const result = await onSave(draft);
    if (!result) {
      return;
    }
    editing = false;
  }

  function cancel() {
    draft = value ?? "";
    editing = false;
  }
</script>

<div class="flex flex-row items-center justify-between gap-2">
  <p>{label}</p>
  {#if editing}
    <Input
      bind:ref={input}
      bind:value={draft}
      onkeypress={(e) => {
        if (e.key === "Enter") {
          void save();
        }
      }}
      {placeholder}
      class="w-full text-foreground"
    />
  {:else}
    <p class="w-full text-foreground">{value}</p>
  {/if}
  <Button
    variant="secondary"
    onclick={() => {
      if (editing) {
        void save();
      } else {
        void startEditing();
      }
    }}
  >
    {#if editing}
      <Save />
    {:else}
      <Pencil />
    {/if}
  </Button>
  {#if editing}
    <Button variant="secondary" onclick={cancel}> <X /> </Button>
  {/if}
</div>
