const STORAGE_KEY = 'nosh_ems_events'
const REGISTRATIONS_KEY = 'nosh_ems_event_registrations'

export const EVENT_STORAGE_EVENT = 'nosh-ems-events-changed'

const emitStorageUpdate = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENT_STORAGE_EVENT))
  }
}

export const getEvents = () => {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const storedEvents = window.localStorage.getItem(STORAGE_KEY)
    if (!storedEvents) {
      return []
    }

    const parsedEvents = JSON.parse(storedEvents)
    return Array.isArray(parsedEvents) ? parsedEvents : []
  } catch (error) {
    console.error('Failed to read events from localStorage:', error)
    return []
  }
}

export const addEvent = (event) => {
  if (typeof window === 'undefined') {
    return null
  }

  const allEvents = getEvents()
  const newEvent = {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ...event,
    created_at: new Date().toISOString(),
  }

  const updatedEvents = [newEvent, ...allEvents]
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedEvents))
  emitStorageUpdate()

  return newEvent
}

export const getEventSummary = () => {
  const events = getEvents()
  const now = Date.now()

  const upcoming = events.filter((event) => {
    if (!event.start_datetime) {
      return false
    }

    return new Date(event.start_datetime).getTime() >= now
  }).length

  const completed = events.filter((event) => {
    if (!event.end_datetime) {
      return false
    }

    return new Date(event.end_datetime).getTime() < now
  }).length

  const attendance = events.reduce((total, event) => {
    return total + (Number(event.attendance) || 0)
  }, 0)

  return {
    total: events.length,
    upcoming,
    completed,
    attendance: attendance.toLocaleString('en-US'),
  }
}

export const getEventRegistrations = (eventId) => {
  if (typeof window === 'undefined' || !eventId) {
    return []
  }

  try {
    const storedRegistrations = window.localStorage.getItem(REGISTRATIONS_KEY)
    if (!storedRegistrations) {
      return []
    }

    const parsedRegistrations = JSON.parse(storedRegistrations)
    if (!Array.isArray(parsedRegistrations)) {
      return []
    }

    return parsedRegistrations.filter((registration) => registration.eventId === eventId)
  } catch (error) {
    console.error('Failed to read event registrations from localStorage:', error)
    return []
  }
}

export const addEventRegistration = (registration) => {
  if (typeof window === 'undefined' || !registration?.eventId) {
    return null
  }

  const savedRegistrations = JSON.parse(window.localStorage.getItem(REGISTRATIONS_KEY) || '[]')
  const newRegistration = {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `registration-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ...registration,
    created_at: new Date().toISOString(),
  }

  const updatedRegistrations = [...savedRegistrations, newRegistration]
  window.localStorage.setItem(REGISTRATIONS_KEY, JSON.stringify(updatedRegistrations))
  emitStorageUpdate()

  return newRegistration
}

export const clearEvents = () => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(STORAGE_KEY)
  window.localStorage.removeItem(REGISTRATIONS_KEY)
  emitStorageUpdate()
}
