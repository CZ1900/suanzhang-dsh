import type { Context } from "@deepseek-ai/cordis";

/** Cordis 插件名。 */
export declare const name = "suanzhang";

/** 浏览器侧依赖服务。 */
export declare const inject: string[];

/** Client 插件入口。 */
export declare function apply(ctx: Context): void;
