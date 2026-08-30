Images referenced from markdown live here and are addressed by absolute path:

    ![what the diagram shows](/images/rail-layout.png)

next/image is off under static export, so nothing is resized or compressed at
build time — a file is served exactly as committed. Compress before adding one;
1400px wide and under 200KB is a reasonable ceiling. `sips -Z 1400 shot.png`
does the resize on macOS.

Binaries in git are permanent: deleting an image later does not shrink the
repository. Only commit images that earn their place — a terminal capture or a
diagram carries information, a decorative header does not.

Obsidian cannot preview absolute paths, which is the accepted cost of not
maintaining a copy step and a path mapping.
