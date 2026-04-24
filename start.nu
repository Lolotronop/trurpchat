def make-tab [title: string, cwd: string, dev_cmd: string] {
  let left_pane = (^wezterm cli spawn --cwd $cwd | str trim)
  ^wezterm cli set-tab-title --pane-id $left_pane $title

  let right_pane = (^wezterm cli split-pane --pane-id $left_pane --right --percent 30 --cwd $cwd | str trim)

  ^wezterm cli send-text --pane-id $left_pane --no-paste "nvim .\r"
  ^wezterm cli send-text --pane-id $right_pane --no-paste $"($dev_cmd)\r"
  ^wezterm cli activate-pane --pane-id $left_pane
}

def main [] {
  let root = $env.FILE_PWD
  let frontend_dir = ($root | path join "frontend")
  let backend_dir = ($root | path join "backend")
  let shared_dir = ($root | path join "shared")

  make-tab "frontend" $frontend_dir "bun run tauri dev"
  make-tab "backend" $backend_dir "bun run dev"
  make-tab "shared" $shared_dir "bun run dev"
}
