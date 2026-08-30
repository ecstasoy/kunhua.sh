---
name: FUSE File System
summary: 用户态实现的类 Unix 文件系统，读写完整。
stack: C · FUSE · Python
code: https://github.com/ecstasoy/FUSE-File-System
order: 5
---

- **盘上格式设计**：自定义 4096 字节块布局，超级块以 magic 校验；inode 占满一整个块，uid/gid/mode/ctime/mtime/size 之后接 1019 个直接块指针；目录项固定 32 字节，含 1 位有效标志、31 位 inode 号与 28 字节文件名
- **块分配**：以位图管理空闲块并常驻内存，由 `bit_set` / `bit_clear` / `bit_test` 三个操作维护，创建、写入、截断时同步更新
- **路径解析**：分两步完成，`parse` 将路径切成分量数组，`translate` 逐级查目录把它转换为 inode 号，供其余操作复用
- **文件系统操作**：实现 16 个 FUSE 回调，覆盖 `getattr`、`readdir`、`create`、`mkdir`、`unlink`、`rmdir`、`rename`、`chmod`、`utime`、`truncate`、`read`、`write`、`statfs`，读写均完整
- **截断与重命名**：`truncate` 需按新长度回收或补足数据块并同步位图；`rename` 需处理跨目录移动时两侧目录项的增删
- **工具链**：配套三个 Python 工具，`gen-disk.py` 依描述文件生成磁盘镜像、`read-img.py` 转储镜像内容、`diskfmt.py` 负责格式化
