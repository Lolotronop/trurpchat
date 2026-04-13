<script lang="ts">
  import { ArrowRight } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import type { Server } from "$lib/servers.svelte";

  type Props = {
    server: Server;
    roomId: number;
    roomName: string;
    onSent?: () => void;
  };

  let { server, roomId, roomName, onSent }: Props = $props();

  let editor = $state<HTMLDivElement>();
  let text = $state("");

  const canSend = $derived(text.trim().length > 0);
  const isEmpty = $derived(text.length === 0);

  function focusEditor() {
    editor?.focus();
  }

  function clearEditor() {
    text = "";
  }

  function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    server.gateway.send({
      type: "action.message.create",
      roomId,
      text: trimmed,
    });

    clearEditor();
    onSent?.();
    focusEditor();
  }

  function insertTextAtSelection(plainText: string) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const lines = plainText.split(/\r\n?|\n/g);
    const fragment = document.createDocumentFragment();

    lines.forEach((line, index) => {
      if (index > 0) {
        fragment.append(document.createElement("br"));
      }
      if (line.length > 0) {
        fragment.append(document.createTextNode(line));
      }
    });

    const lastNode = fragment.lastChild;
    range.insertNode(fragment);

    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    text = editor?.textContent ?? "";
  }
</script>

<div class="flex flex-row w-full pb-2 px-2">
  <InputGroup.Root class="h-auto min-h-12 items-stretch cursor-text" onclick={focusEditor}>
    <div class="relative flex min-h-12 flex-1 items-center self-stretch">
      {#if isEmpty}
        <div
          class="pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2 text-muted-foreground text-base md:text-sm"
        >
          #{roomName}
        </div>
      {/if}

      <div
        bind:this={editor}
        bind:textContent={text}
        contenteditable="true"
        data-slot="input-group-control"
        role="textbox"
        aria-multiline="true"
        tabindex="0"
        class="message-input block max-h-40 min-h-[1.25rem] w-full overflow-y-auto px-3 py-2 text-base leading-5 whitespace-pre-wrap break-words bg-transparent outline-none md:text-sm"
        onkeydown={(event) => {
          const holdsModifier = event.ctrlKey || event.metaKey || event.shiftKey;
          if (!holdsModifier && event.key === "Enter") {
            event.preventDefault();
            sendMessage();
          }
        }}
        onpaste={(event) => {
          event.preventDefault();
          const plainText = event.clipboardData?.getData("text/plain") ?? "";
          insertTextAtSelection(plainText);
        }}
      ></div>
    </div>
    <InputGroup.Addon align="inline-end">
      <Button
        disabled={!canSend}
        class="ms-auto h-full!"
        size="sm"
        variant="ghost"
        onclick={sendMessage}
      >
        <ArrowRight />
      </Button>
    </InputGroup.Addon>
  </InputGroup.Root>
</div>
