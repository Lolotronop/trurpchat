
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/server" | "/server/[id]";
		RouteParams(): {
			"/server/[id]": { id: string }
		};
		LayoutParams(): {
			"/": { id?: string };
			"/server": { id?: string };
			"/server/[id]": { id: string }
		};
		Pathname(): "/" | "/server" | "/server/" | `/server/${string}` & {} | `/server/${string}/` & {};
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/favicon.png" | "/loudness.js" | "/noise-gate.js" | "/svelte.svg" | "/tauri.svg" | "/vite.svg" | string & {};
	}
}