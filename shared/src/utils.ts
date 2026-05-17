export type Flatten<T> = { [K in keyof T]: T[K] } & {};

export type Select<T, K extends keyof T> = Pick<T, K>;
