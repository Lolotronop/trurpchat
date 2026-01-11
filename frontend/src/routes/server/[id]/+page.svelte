<script lang="ts">
    // TODO: get the serverId from props somehow withiout the server?
    // let props = $props();

    const location = window.location.href;
    const split = location.split("/")
    const serverId = split[split.length - 1];
    console.log(serverId);
</script>


{#if server === undefined}
    <div class="w-full h-full flex items-center justify-center">
        No such server sorry
    </div>
{:else}
    There is a server like that!
{/if}

