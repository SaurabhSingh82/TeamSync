import { Avatar } from '../ui/Avatar'

interface AvatarPerson {
  id: string
  username: string
  first_name: string
  last_name: string
  avatar_url: string | null
}

export function AvatarGroup({
  people,
  total,
}: {
  people: AvatarPerson[]
  total?: number
}) {
  const remaining = Math.max(0, (total ?? people.length) - people.length)

  return (
    <div aria-label={`${total ?? people.length} project members`} className="flex items-center" role="group">
      {people.map((person, index) => {
        const name = [person.first_name, person.last_name]
          .filter(Boolean)
          .join(' ') || person.username
        return (
          <Avatar
            alt={name}
            className={`size-8 border-2 border-white ${index ? '-ml-2' : ''}`}
            key={person.id}
            name={name}
            src={person.avatar_url}
          />
        )
      })}
      {remaining > 0 && (
        <span className="-ml-2 grid size-8 place-items-center rounded-full border-2 border-white bg-slate-100 text-[10px] font-semibold text-slate-600">
          +{remaining}
        </span>
      )}
    </div>
  )
}
