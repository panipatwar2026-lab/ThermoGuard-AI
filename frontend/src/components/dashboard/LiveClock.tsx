import { useEffect, useState } from 'react'

export default function LiveClock() {
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return <span className="tabular-nums">{time.toLocaleTimeString()}</span>
}
