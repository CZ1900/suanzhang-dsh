/**
 * suanzhang-dsh 类型声明
 */
import type { Context } from "@deepseek-ai/cordis";

/** 计费配置（当前保持硬编码；预留未来扩展）。 */
export interface Config {}

/** Cordis 插件名。 */
export declare const name = "suanzhang";

/** 插件依赖服务。 */
export declare const inject: string[];

/** Host 插件入口。 */
export declare function apply(ctx: Context, config: Config): void;
