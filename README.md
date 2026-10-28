# dsh-mouse-blur

鼠标动，背景糊；鼠标停，背景清。

一个很小的 DSH Web 客户端插件：当鼠标/触控板**静默**时，背景的模糊度回到 **0**；当鼠标**移动、点击或滚轮**时，背景模糊到你设置的百分比。支持 dsh-cool-theme 0.9 的图片背景，以及 0.10 的图片/视频背景。活动模糊度、过渡时间、静默时长都可以在 DSH 设置里调。

## 效果（默认值）

| 状态 | 背景模糊 |
| --- | --- |
| 指针静默 1.2 秒 | `0 px`（完全清晰） |
| 移动 / 按下 / 点击 / 滚轮 | `9.6 px`（24 px 满量程的 40%） |

## 设置

打开 **更多 → 设置 → 主题 · 鼠标模糊**（就排在「主题」下面）。

| 设置项 | 范围 | 默认 | 说明 |
| --- | --- | --- | --- |
| 活动时模糊 | 0–100% | 40% | 相对 cool-theme 模糊滑杆满量程 24 px；40% = 9.6 px |
| 过渡时间 | 100–2000 ms | 320 ms | 清晰 ↔ 模糊的切换时长 |
| 静默归零 | 100–3000 ms | 1200 ms | 鼠标停下多久后恢复清晰 |

拖动滑块立即生效，不需要保存或刷新。设置保存在**当前浏览器**（cookie 为主、`localStorage` 兜底），DSH 重启换了端口也能保留；换浏览器会各用各的。右下角有「恢复默认」。

> 「主题」页本身是 dsh-cool-theme 的封闭面板，没有开放条目扩展点；本插件通过 DSH 官方的 `settings.section` 扩展点，注册了紧挨着「主题」的独立分区「主题 · 鼠标模糊」。

## 前置条件

- DSH 的 **Web** 界面（桌面版或 `dsh web` 都可以）。
- 安装了 **dsh-cool-theme**（0.9.x / 0.10.x 验证过），并且当前主题有**背景图片或背景视频**。
- 没有 cool-theme 或没有背景媒体时，插件仍会加载、设置页也能打开，但画面上看不到效果。

## 从 npm 安装

插件已发布到 npm，包名 `dsh-mouse-blur`。在 DSH 插件页「添加插件」直接输入包名即可，或：

```bash
dsh plugin --profile desktop add dsh-mouse-blur
```

## 在另一台 DSH 上安装（tgz）

1. 把 `dsh-mouse-blur-0.3.0.tgz` 拷到目标机器。
2. 打开 DSH：**插件 → 添加插件 → 安装第三方插件**。
3. 填 tgz 的**绝对路径**，例如：

   ```text
   C:\Users\you\Downloads\dsh-mouse-blur-0.3.0.tgz
   ```

4. 点安装。安装器会把依赖写进 profile，并把 `dsh-mouse-blur` 加进 `dsh.profile.bundles`。
5. 如果安装完成界面有「立即启用」，点它；没有的话到插件列表里确认 `dsh-mouse-blur` 已启用。
6. 页面没变化就 `Ctrl+R` 刷新一次。

命令行等价写法（需要 `dsh` CLI 在 PATH 里）：

```bash
dsh plugin --profile desktop add "file:C:/Users/you/Downloads/dsh-mouse-blur-0.3.0.tgz"
```

注意事项：

- 本地路径必须是**绝对路径**，相对路径会被 DSH 拒绝。
- 要装进目标 DSH **实际使用的 profile**（这台是 `desktop`；别的机器可能是 `web`、`default` 或其他名字）。
- 安装后 profile 的 `package.json` 和 `pnpm-lock.yaml` 会引用这个 tgz 的路径。**别删、别挪**；要换位置就重新安装一次。
- tgz 安装是把文件**复制**进 profile 的 `node_modules`，之后改源码目录不会自动生效。

## 从源码安装（开发用）

在 DSH 插件页填源码文件夹的绝对路径，或：

```bash
dsh plugin --profile desktop add "link:C:/deepseekworkfiled/dsh-mouse-blur"
```

`link:` 安装会跟随源码改动，适合一边改一边看效果。源码路径被删掉时插件会失效，这也是 tgz 安装更稳的原因。

## 验证是否生效

- 插件列表里 `dsh-mouse-blur` 是启用状态；
- 设置里能看到「主题 · 鼠标模糊」，三个滑块的范围是 `0–100`、`100–2000`、`100–3000`；
- 鼠标移动时，`<html>` 上出现 `data-dsh-mouse-blur-active`；
- `<head>` 里有 `<style data-plugin-css="dsh-mouse-blur/background.css">`；
- 鼠标停下约 1.2 秒后，背景图从模糊变清晰。

## 调整默认值

优先用设置页。要改代码里的默认值，改 `lib/client.js` 里的 `SETTING_SPECS`，然后重新打包/安装（`link:` 安装可直接刷新）：

```js
const SETTING_SPECS = {
  activePercent: { min: 0, max: 100, step: 1, default: 40 },
  transitionMs: { min: 100, max: 2000, step: 10, default: 320 },
  idleDelayMs: { min: 100, max: 3000, step: 10, default: 1200 },
};
```

注意：活动模糊度是**满量程** 24 px 的百分比，不是「当前主题模糊度 × 百分比」。如果主题原本设的是 3 px，40% 活动时会明显更糊，正是这个效果。

## 实现

- 浏览器半边监听 `pointermove` / `pointerdown` / `mousedown` / `click` / `wheel`，用 `requestAnimationFrame` 合并高频事件。
- 活动状态写在 `<html data-dsh-mouse-blur-active>` 上，CSS 把 `--ct-bg-blur-light/dark` 覆盖为 `0px` 或当前百分比对应的 px。
- 设置页写入模块内共享的设置 store；运行时订阅同一个 store，滑块一动就更新 CSS 变量、过渡时长和静默计时。
- 选择器覆盖 cool-theme 0.10 的 `.ct-bg-side`（图片/视频）、0.9 的 `.ct-bg-image`、0.10 的作曲家视频 `.ct-bg-composer-video`，以及输入框上方的作曲家背景伪元素。
- 遵守 `prefers-reduced-motion`（减少动态效果时不做过渡）。
- 通过 `ctx.effect` 注册清理：停用/热更新时移除监听、样式、设置页和状态属性。

## 兼容性

- 仅 Web 客户端；宿主半边是空实现，只用于让 `dsh-client-modules` 把客户端 bundle 编入启动图。
- 没有 cool-theme 背景媒体时无副作用（变量被覆盖但没人绘制背景）。
- 适配 dsh-cool-theme 0.9.x（`.ct-bg-image`）和 0.10.x（`.ct-bg-side`，图片/视频）。
- 已在 DSH NEXT 2.0.19-next（DSH 0.2.1-rc.2）+ dsh-cool-theme 0.10.0 上安装并验证。

## 卸载

在插件页卸载，或者从 profile 的 `package.json` 里移除 `dependencies` 和 `dsh.profile.bundles` 中的 `dsh-mouse-blur`，再跑一次 `pnpm install`。浏览器里的设置会留在 localStorage，重新安装后继续沿用；要清掉就在设置页恢复默认，或删除 `dsh-mouse-blur/settings/v1`。
