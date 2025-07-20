<script>
  let { children } = $props();
  import { ModeWatcher, setMode } from "mode-watcher";
  import "../app.css";
</script>

<ModeWatcher defaultMode="dark" />
{@render children()}
