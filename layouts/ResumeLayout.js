import { PageSEO } from '@/components/SEO'
import { siteMetadata } from '@/data/siteMetadata'

export default function ResumeLayout({ children, frontMatter }) {
  const description = 'My professional career, experience, and skills.'
  const { name, avatar, occupation, company, email, twitter, linkedin, github } = frontMatter
  return (
    <>
      <PageSEO title={`Resume - ${name}`} description={description} />
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        <div className="space-y-2 pb-8 pt-6 md:space-y-5">
          <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
            Resume
          </h1>
          <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <div className="items-start space-y-2 xl:space-y-0">
          <div className="prose prose-lg max-w-none pb-8 pt-8 dark:prose-dark">{children}</div>
        </div>
      </div>
    </>
  )
}
