/**
 * 回归测试：schemastery 不可用时的降级路径，必须导出 undefined 的 Config。
 *
 * 背景：宿主 @deepseek-ai/dsh-settings 的 `SettingsForms#schema()` 用
 *
 *   return schema !== void 0 && 'toJSON' in schema ? schema : void 0
 *
 * 判断一个插件是否声明了可投影的配置 schema。它排除了 undefined，却没有排除 null；
 * 因此本插件一旦降级为 `Config = null`，`'toJSON' in null` 会抛 TypeError 并**逃出**
 * `settings.describe()`。而 describe() 既是设置读取接口、也是每次 settings 写入的内部
 * 步骤，于是整份设置文档（所有插件的命名空间）一起失效：设置页读不出也写不进，桌面端
 * 引导进度无法持久化——每次启动都重新要求初始化，保存时报“未能保存设置，请重试”。
 *
 * 本文件先在模块加载前让所有 schemastery 解析尝试失败，再加载插件，从而在进程内复现
 * 宿主里的降级路径。（`node --test` 每个测试文件独立进程，这里的 patch 不影响其它文件。）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'

const realLoad = Module._load
Module._load = function (request, parent, isMain) {
  // loadSchemastery() 的两条路径：猜测的全局安装路径，以及标准 require。
  if (request === '@deepseek-ai/schemastery' || /schemastery[\\/]lib[\\/]index\.cjs$/.test(request)) {
    const error = new Error(`Cannot find module '${request}'`)
    error.code = 'MODULE_NOT_FOUND'
    throw error
  }
  return realLoad.call(this, request, parent, isMain)
}

const require = createRequire(import.meta.url)
const plugin = require('../src/index.js')

/** 与 @deepseek-ai/dsh-settings `SettingsForms#schema()` 完全一致的探测表达式。 */
const hostSchemaDiscovery = (Config) => (Config !== void 0 && 'toJSON' in Config ? Config : void 0)

test('降级路径导出的 Config 必须是 undefined，不能是 null', () => {
  assert.notStrictEqual(plugin.Config, null, 'Config = null 会让宿主的 "toJSON" in schema 抛 TypeError')
  assert.equal(plugin.Config, undefined)
})

test('宿主的 schema 探测对导出的 Config 不抛异常', () => {
  assert.doesNotThrow(() => hostSchemaDiscovery(plugin.Config))
  assert.equal(hostSchemaDiscovery(plugin.Config), undefined)
})
