# 容器镜像与 Kubernetes 部署

这个目录为仓库加了两样东西：一个运行单个 DSH Web 主机的容器镜像，以及把它跑起来的 Kubernetes 清单。除下面说明的那一处认证判断之外，`deploy/` 以外的内容都来自上游。

## 镜像里有什么

构建阶段复刻 [`.github/workflows/release.yml`](../.github/workflows/release.yml) 的打包步骤：先做 official 构建，把 `dsh` 与 `vendor` 两个发布族打成 tarball，单独打 Landlock 入口包，再用这些 tarball 装配出一个消费者安装，装配方式与 `scripts/release/verify-packed-install.ts` 验证的路径一致。运行阶段只拷贝这份消费者安装，因此镜像里没有源码树、没有 pnpm，也没有构建工具链。

运行期新增的系统包是 `bash`、`git`、`ca-certificates`、`tini`。agent 需要前两者；`tini` 负责回收孤儿进程并转发信号，因为 `dsh` 会派生 shell 子进程。

## 认证判断

[`packages/client/connection/src/browser-auth.ts`](../packages/client/connection/src/browser-auth.ts) 在模块加载时读取一次 `DSH_PROXY_AUTH_HEADER`。该变量指定一个请求头名称后，`isAuthenticated` 会在启动 token 交换与 cookie 校验之前，把携带该头且值非空的请求直接认定为 owner Peer。

| `DSH_PROXY_AUTH_HEADER` | 请求头情况 | 结果 |
|---|---|---|
| 未设置 | 任意 | 保持原有的 cookie 与启动 token 流程 |
| 已设置 | 头缺失、为空、或只有空白 | 回落到 cookie 校验 |
| 已设置 | 头存在且值非空 | 认定为 owner Peer |

这等于把信任交给任何能设置该头的人。只有当到达端口的每一条路径都经过一个会覆写该头的代理时，才能启用。`deploy/k8s/middleware-forwardauth.yaml` 就是给这个代理准备的，目前还没有接入 `kustomization.yaml`。

## 构建

在仓库根目录构建，`COPY . .` 才能看到完整检出，其中也包括构建过程要读的 `.git`，`build:official` 用它取内嵌的提交哈希。

```sh
docker build -f deploy/Dockerfile -t <registry>/dsh-online:0.2.2-rc.1.1 .
```

镜像约 3.9 GB，绝大部分是全部已发布包的消费者安装，其中约一吉字节是媒体工具与中文字体。

### 镜像标签

标签形式是 `<上游版本>.<fork 修订号>`。`0.2.2-rc.1.1` 表示在上游 `0.2.2-rc.1` 之上的第一个补丁构建；补丁或镜像有变动但上游没动时递增到 `.2`；上游发布新版本后从 `.1` 重新开始。镜像内部报告的版本仍是上游包版本，fork 修订只体现在标签上。

## 运行

`deploy/entrypoint.sh` 组装参数并启动安装好的 `dsh`。

| 变量 | 必需 | 含义 |
|---|---|---|
| `POD_IP` | 是 | 监听地址，来自 downward API；`--host` 不接受通配地址 |
| `DSH_PORT` | 否 | 监听端口，默认 `3080` |
| `DSH_PUBLIC_URL` | 否 | 对外公布的根地址，作为 `--public-url` 传入 |
| `DSH_TRUSTED_HOST` | 否 | 额外接受的 authority，作为 `--trusted-host` 传入 |
| `DSH_HOME` | 否 | 状态目录，镜像里设为 `/data/dsh` |
| `DSH_PERMISSION_MODE` | 否 | 镜像里设为 `danger-full-access`，命令隔离只剩容器边界 |
| `DSH_PROXY_AUTH_HEADER` | 否 | 见上一节；镜像里为空 |

镜像只通过 `DSH_TRUSTED_HOST` 接受一个 authority。需要多个时扩展入口脚本。

## 工具与用户态安装

运行层带了日常命令行工具：`bash`、`git`、`curl`、`jq`、`file`、`unzip`、`zip`、`less`、`tree`、`procps`、`ripgrep`、`fd`、`bat`、`sqlite3`、`zstd`、`xz`、`openssh-client`，以及带 `venv` 和 `pipx` 的 `python3`。媒体处理由 `ffmpeg`、ImageMagick、`librsvg2-bin`、`poppler-utils`、`ghostscript`、`webp`、`exiftool` 覆盖，另装了 Noto CJK 与 DejaVu 字体用于文字渲染。

进程不以 root 运行，agent 用不了 `apt`。镜像改为在 `PATH` 上放三个前缀，并给它们挂一个卷：

| 路径 | 用途 |
|---|---|
| `/data/tools/bin` | 单文件静态二进制 |
| `/data/tools/npm/bin` | `npm install -g --prefix /data/tools/npm` |
| `/data/tools/py/bin` | 虚拟环境与 `pipx --home /data/tools/pipx` |

`deploy/agent/` 存放让 agent 正确使用这套约定的说明。首次启动时入口脚本把它们拷进 home 卷：

- `AGENTS.md` 变成 `$DSH_HOME/AGENTS.md`，即全局指令文件。
- `skills/container-toolbox/` 变成 `$DSH_HOME/skills/container-toolbox/`，技能里写着各类安装方法和需要系统包时要发的那条请求。

卷里已经存在的版本不会被覆盖，所以你可以直接改这两个文件，不用重建镜像。装到这三个前缀之外的路径在 Pod 重启后会消失。

## 清单

| 文件 | 内容 |
|---|---|
| `k8s/namespace.yaml` | `dsh` 命名空间 |
| `k8s/pvc.yaml` | `dsh-home` 挂到 `/data/dsh`，`dsh-workspace` 挂到 `/workspace`，`dsh-tools` 挂到 `/data/tools` |
| `k8s/deployment.yaml` | 单副本，`Recreate` 更新，TCP 就绪与存活检查 |
| `k8s/service.yaml` | ClusterIP，端口 3080 |
| `k8s/ingress.yaml` | Traefik ingress |
| `k8s/middleware-forwardauth.yaml` | forwardAuth 中间件，等 oauth2-proxy 就绪后再应用 |
| `k8s/kustomization.yaml` | 上面五个对象，不含中间件 |

应用之前要填的占位：镜像地址、两处主机名、三个 PVC 的 `storageClassName`。`fsGroup: 1000` 假设存储插件支持变更属主；不支持的存储上 home 卷对容器用户不可写，需要 init 容器或直接以 root 运行。

更新策略用 `Recreate`，因为同一个 home 目录只能由一个进程写入。

## 升级

补丁是叠在上游 tag 上的一个提交。

```sh
git fetch upstream
git rebase upstream/master        # 或新的发布 tag
docker build -f deploy/Dockerfile -t <registry>/dsh-online:<新 tag> .
docker push <registry>/dsh-online:<新 tag>
```

补丁、构建脚本或基础镜像变化时都要重新构建；上游仅移动 tag 不需要改动清单。

## 已知限制

- 单副本。会话库、凭据、cookie 签名密钥都属于同一个 home 目录和同一个进程。
- 没有任何机制限制访问 Pod 端口的来源。集群内的任何工作负载都能连上去并伪造认证头。
- 启动行会把带 token 的地址打进容器日志，有日志读取权限的人都能看到。
- 没有独立的健康端点。就绪检查是端口上的 TCP 连接，因此 API 真正可用之前 Pod 就已经接流量，浏览器一侧会重试。
- 内置沙箱通过 `DSH_PERMISSION_MODE` 关闭，命令隔离只依赖容器。
- 镜像只有 amd64。基础镜像与 Landlock 入口包都跟随构建机架构。
