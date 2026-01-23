<script lang="ts">
  import * as Avatar from "$lib/components/ui/avatar";
  type Props = {
    class?: string;
    src?: string;
    name: string;
  };
  const { class: clazz, src, name }: Props = $props();
</script>

<Avatar.Root class={clazz}>
  <Avatar.Image {src} alt={name} />
  <Avatar.Fallback class="select-none">
    <div
      class="cont w-full h-full rounded-full flex justify-center items-center"
    >
      <p class="letter">
        {name[0].toUpperCase()}
      </p>
    </div>
  </Avatar.Fallback>
</Avatar.Root>

<style>
  .cont {
    container-type: size;
  }
  @container (width > 1px) {
    .letter {
      font-size: 50cqh;
    }
  }
</style>
