import { marked } from 'marked'
import playbook from '../../framework/PLAYBOOK.md?raw'
import templates from '../../framework/launch-invite.md?raw'

const html = marked.parse(playbook, { async: false }) as string
const tplHtml = marked.parse(templates, { async: false }) as string

export default function Playbook() {
  return (
    <div className="page prose">
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <hr />
      <div dangerouslySetInnerHTML={{ __html: tplHtml }} />
    </div>
  )
}
