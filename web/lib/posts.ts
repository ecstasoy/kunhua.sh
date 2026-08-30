import path from "node:path";
import * as fs from "node:fs";
import matter from "gray-matter";
import {unified} from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

const DIR = path.join(process.cwd(), '..', 'content', 'posts');

export type PostMeta = { slug: string; title: string; date: string; excerpt: string };
export type Posts = PostMeta & { html: string };

function read(slug: string) {
    const raw = fs.readFileSync(path.join(DIR, `${slug}.md`), 'utf8');
    const { data, content } = matter(raw);

    for (const field of ['title', 'date', 'excerpt'] as const) {
        if (!data[field]) {
            throw new Error(`content/posts/${slug}.md is missing front-matter: ${field}`);
        }
    }

    const meta: PostMeta = {
        slug,
        title: String(data.title),
        date: new Date(data.date).toISOString().slice(0, 10),
        excerpt: String(data.excerpt),
    };
    return { meta, content };
}


export function getAllPosts(): PostMeta[] {
    return fs
        .readdirSync(DIR)
        .filter((f) => f.endsWith('.md'))
        .map((f) => read(f.replace(/\.md$/, '')).meta)
        .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): Posts {
    const { meta, content } = read(slug);
    const html = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(rehypeStringify)
        .processSync(content)
        .toString();
    return { ...meta, html };
}