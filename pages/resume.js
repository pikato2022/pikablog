import { MDXLayoutRenderer } from '@/components/MDXComponents'
import { getFileBySlug } from '@/lib/mdx'

const DEFAULT_LAYOUT = 'ResumeLayout'

export async function getStaticProps() {
  const resumeData = await getFileBySlug('authors', ['resume'])
  return { props: { resumeData } }
}

export default function About({ resumeData }) {
  const { mdxSource, frontMatter } = resumeData

  return (
    <MDXLayoutRenderer
      layout={frontMatter.layout || DEFAULT_LAYOUT}
      mdxSource={mdxSource}
      frontMatter={frontMatter}
    />
  )
}
