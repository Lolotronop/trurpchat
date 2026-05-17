#!/usr/bin/env bash
tmux send-keys 'cd frontend' C-m
tmux send-keys 'nvim .' C-m
tmux split-window -h
tmux send-keys 'cd frontend' C-m
tmux send-keys 'bun run dev' C-m

tmux new-window

tmux send-keys 'cd backend' C-m
tmux send-keys 'nvim .' C-m
tmux split-window -h
tmux send-keys 'cd backend' C-m
tmux send-keys 'bun run dev' C-m
