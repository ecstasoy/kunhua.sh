---
name: "FUSE File System"
summary: "A Unix-like file system in user space, read and write, with two unit-test suites totalling 39KB."
---

- **On-disk format**: a custom 4096-byte block layout with a magic-checked superblock. An inode fills a whole block — uid, gid, mode, ctime, mtime and size, followed by 1019 direct block pointers — and a directory entry is a fixed 32 bytes holding a 1-bit valid flag, a 31-bit inode number and a 28-byte name
- **Block allocation**: free blocks are tracked in a bitmap held in memory and maintained through `bit_set`, `bit_clear` and `bit_test`, updated on creation, write and truncation
- **Path resolution**: done in two steps that everything else reuses — `parse` splits a path into components, `translate` walks the directories to turn it into an inode number
- **File system operations**: 16 ***FUSE*** callbacks covering `getattr`, `readdir`, `create`, `mkdir`, `unlink`, `rmdir`, `rename`, `chmod`, `utime`, `truncate`, `read`, `write` and `statfs`, with both reads and writes complete
- **Truncation and renaming**: `truncate` reclaims or adds data blocks to reach the new length and keeps the bitmap in step; `rename` handles adding and removing directory entries on both sides of a move
- **Tooling**: three ***Python*** utilities alongside it — `gen-disk.py` builds a disk image from a description, `read-img.py` dumps one, `diskfmt.py` formats
- **Tests**: two Check suites totalling 39KB, against 34KB of implementation
