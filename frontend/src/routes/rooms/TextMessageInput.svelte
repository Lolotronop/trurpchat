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

  const MENTION_REGEX = /<@(\d+)>/g;

  let { server, roomId, roomName, onSent }: Props = $props();

  let editor = $state<HTMLDivElement>();
  let text = $state("");

  const canSend = $derived(text.trim().length > 0);
  const isEmpty = $derived(text.length === 0);

  function focusEditor() {
    editor?.focus();
  }

  function getMentionLabel(userId: number) {
    const user = server.findUser(userId);
    return `@${user?.name ?? userId}`;
  }

  function createMentionNode(raw: string, userId: number) {
    const mention = document.createElement("span");
    mention.className = "text-foreground font-medium";
    mention.dataset.mentionRaw = raw;
    mention.dataset.mentionId = String(userId);
    mention.contentEditable = "false";
    mention.textContent = getMentionLabel(userId);
    return mention;
  }

  function appendRawText(fragment: DocumentFragment, value: string) {
    const lines = value.split(/\r\n?|\n/g);
    lines.forEach((line, index) => {
      if (index > 0) {
        fragment.append(document.createElement("br"));
      }
      if (line.length > 0) {
        fragment.append(document.createTextNode(line));
      }
    });
  }

  function rawLength(node: Node): number {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.length ?? 0;
    }

    if (node.nodeName === "BR") {
      return 1;
    }

    if (node instanceof HTMLElement) {
      const mentionRaw = node.dataset.mentionRaw;
      if (mentionRaw) {
        return mentionRaw.length;
      }
    }

    let length = 0;
    node.childNodes.forEach((child) => {
      length += rawLength(child);
    });
    return length;
  }

  function serializeNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? "";
    }

    if (node.nodeName === "BR") {
      return "\n";
    }

    if (node instanceof HTMLElement) {
      const mentionRaw = node.dataset.mentionRaw;
      if (mentionRaw) {
        return mentionRaw;
      }
    }

    let value = "";
    node.childNodes.forEach((child) => {
      value += serializeNode(child);
    });
    return value;
  }

  function isEditorVisuallyEmpty(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent ?? "").length === 0;
    }

    if (node.nodeName === "BR") {
      return true;
    }

    if (node instanceof HTMLElement && node.dataset.mentionRaw) {
      return false;
    }

    for (const child of node.childNodes) {
      if (!isEditorVisuallyEmpty(child)) {
        return false;
      }
    }

    return true;
  }

  function serializeEditor() {
    if (!editor || isEditorVisuallyEmpty(editor)) {
      return "";
    }
    return serializeNode(editor);
  }

  function getRawOffset(container: Node, offset: number): number {
    if (!editor) {
      return 0;
    }

    if (container === editor) {
      let total = 0;
      for (let i = 0; i < offset; i++) {
        const child = editor.childNodes[i];
        if (child) {
          total += rawLength(child);
        }
      }
      return total;
    }

    if (container.nodeType === Node.TEXT_NODE) {
      return Math.min(offset, container.textContent?.length ?? 0);
    }

    if (container instanceof HTMLElement && container.dataset.mentionRaw) {
      return offset > 0 ? container.dataset.mentionRaw.length : 0;
    }

    let total = 0;
    for (let i = 0; i < offset; i++) {
      const child = container.childNodes[i];
      if (child) {
        total += rawLength(child);
      }
    }
    return total;
  }

  function getSelectionOffsets() {
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return null;
    }

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (
      !anchorNode ||
      !focusNode ||
      (!editor.contains(anchorNode) && anchorNode !== editor) ||
      (!editor.contains(focusNode) && focusNode !== editor)
    ) {
      return null;
    }

    return {
      anchor: getOffsetFromRoot(selection.anchorNode, selection.anchorOffset),
      focus: getOffsetFromRoot(selection.focusNode, selection.focusOffset),
    };
  }

  function getOffsetFromRoot(node: Node | null, offset: number): number {
    if (!editor || !node) {
      return 0;
    }

    let current: Node | null = node;
    let total = getRawOffset(node, offset);

    while (current && current !== editor) {
      const parent = current.parentNode;
      if (!parent) {
        break;
      }

      let sibling = current.previousSibling;
      while (sibling) {
        total += rawLength(sibling);
        sibling = sibling.previousSibling;
      }

      current = parent;
    }

    return total;
  }

  function resolvePoint(target: number): { container: Node; offset: number } {
    if (!editor) {
      return { container: document.body, offset: 0 };
    }

    const totalLength = rawLength(editor);
    const clamped = Math.max(0, Math.min(target, totalLength));

    function visit(
      node: Node,
      currentOffset: number,
    ): {
      container: Node;
      offset: number;
    } | null {
      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.textContent?.length ?? 0;
        if (clamped <= currentOffset + length) {
          return { container: node, offset: clamped - currentOffset };
        }
        return null;
      }

      if (node.nodeName === "BR") {
        const parent = node.parentNode ?? editor;
        const index = Array.prototype.indexOf.call(parent.childNodes, node);
        if (clamped <= currentOffset) {
          return { container: parent, offset: index };
        }
        if (clamped <= currentOffset + 1) {
          return { container: parent, offset: index + 1 };
        }
        return null;
      }

      if (node instanceof HTMLElement && node.dataset.mentionRaw) {
        const length = node.dataset.mentionRaw.length;
        const parent = node.parentNode ?? editor;
        const index = Array.prototype.indexOf.call(parent.childNodes, node);
        if (clamped <= currentOffset) {
          return { container: parent, offset: index };
        }
        if (clamped <= currentOffset + length) {
          return { container: parent, offset: index + 1 };
        }
        return null;
      }

      let nextOffset = currentOffset;
      for (const child of node.childNodes) {
        const result = visit(child, nextOffset);
        if (result) {
          return result;
        }
        nextOffset += rawLength(child);
      }

      if (node === editor) {
        return { container: editor, offset: editor.childNodes.length };
      }

      return null;
    }

    return (
      visit(editor, 0) ?? {
        container: editor,
        offset: editor.childNodes.length,
      }
    );
  }

  function restoreSelection(anchor: number, focus: number) {
    const selection = window.getSelection();
    if (!editor || !selection) {
      return;
    }

    const anchorPoint = resolvePoint(anchor);
    const focusPoint = resolvePoint(focus);
    const range = document.createRange();

    range.setStart(anchorPoint.container, anchorPoint.offset);
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);

    if (anchor !== focus) {
      selection.extend(focusPoint.container, focusPoint.offset);
    } else {
      const collapsed = document.createRange();
      collapsed.setStart(focusPoint.container, focusPoint.offset);
      collapsed.collapse(true);
      selection.removeAllRanges();
      selection.addRange(collapsed);
    }
  }

  function renderRawText(raw: string) {
    if (!editor) {
      return;
    }

    const selection = getSelectionOffsets();
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const match of raw.matchAll(MENTION_REGEX)) {
      const index = match.index ?? 0;
      const full = match[0];
      const userId = Number(match[1]);

      appendRawText(fragment, raw.slice(lastIndex, index));
      fragment.append(createMentionNode(full, userId));
      lastIndex = index + full.length;
    }

    appendRawText(fragment, raw.slice(lastIndex));

    editor.replaceChildren(fragment);

    if (selection) {
      restoreSelection(selection.anchor, selection.focus);
    }
  }

  function syncTextFromEditor() {
    text = serializeEditor();
    renderRawText(text);
  }

  function replaceRawRange(start: number, end: number, replacement: string) {
    const from = Math.max(0, Math.min(start, end));
    const to = Math.max(0, Math.max(start, end));
    text = `${text.slice(0, from)}${replacement}${text.slice(to)}`;
    renderRawText(text);
    restoreSelection(from + replacement.length, from + replacement.length);
  }

  function getSelectedRawRange() {
    const selection = getSelectionOffsets();
    if (!selection) {
      return null;
    }

    const start = Math.min(selection.anchor, selection.focus);
    const end = Math.max(selection.anchor, selection.focus);
    return { start, end };
  }

  function clearEditor() {
    text = "";
    renderRawText(text);
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

    const fragment = document.createDocumentFragment();
    appendRawText(fragment, plainText);

    const lastNode = fragment.lastChild;
    range.insertNode(fragment);

    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    syncTextFromEditor();
  }

  $effect(() => {
    if (!editor) {
      return;
    }

    if (serializeEditor() !== text) {
      renderRawText(text);
    }
  });
</script>

<div class="flex flex-row w-full pb-2 px-2">
  <InputGroup.Root
    class="h-auto min-h-12 items-stretch cursor-text"
    onclick={focusEditor}
  >
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
        contenteditable="true"
        data-slot="input-group-control"
        role="textbox"
        aria-multiline="true"
        tabindex="0"
        class="message-input block max-h-40 min-h-[1.25rem] w-full overflow-y-auto px-3 py-2 text-base leading-5 whitespace-pre-wrap break-words bg-transparent outline-none md:text-sm"
        oninput={syncTextFromEditor}
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
        oncopy={(event) => {
          const selected = getSelectedRawRange();
          if (!selected || selected.start === selected.end) {
            return;
          }

          event.preventDefault();
          event.clipboardData?.setData(
            "text/plain",
            text.slice(selected.start, selected.end),
          );
        }}
        oncut={(event) => {
          const selected = getSelectedRawRange();
          if (!selected || selected.start === selected.end) {
            return;
          }

          event.preventDefault();
          event.clipboardData?.setData(
            "text/plain",
            text.slice(selected.start, selected.end),
          );
          replaceRawRange(selected.start, selected.end, "");
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
