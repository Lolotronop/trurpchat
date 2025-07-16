<script>
  let { children } = $props();
  import { ModeWatcher } from "mode-watcher";
  import "../app.css";
</script>

<ModeWatcher defaultMode="dark" />
{@render children()}
