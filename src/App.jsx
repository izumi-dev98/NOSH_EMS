import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import Swal from 'sweetalert2'
import logo from './assets/edited_logo_ems.png'
import {
  EVENT_STORAGE_EVENT,
  addEvent,
  addEventRegistration,
  getEventRegistrations,
  getEventSummary,
  getEvents,
} from './lib/storage'

const navItems = [
  { to: '/event', label: 'Event' },
  { to: '/event-report', label: 'Event Report' },
]

const toMyanmarDateTime = (value) => {
  if (!value) return null

  const date = new Date(`${value}:00+06:30`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const formatDateTime = (value) => {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Yangon',
  }).format(date)
}

const getMyanmarDateKey = (date) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yangon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(date)
  const values = {}

  parts.forEach((part) => {
    if (part.type !== 'literal') {
      values[part.type] = part.value
    }
  })

  return `${values.year}-${values.month}-${values.day}`
}

const getLocalDateKey = (date) => getMyanmarDateKey(date)

const parseLocalDateKey = (dateKey) => {
  if (!dateKey) {
    return new Date()
  }

  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day || Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return new Date()
  }

  return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00+06:30`)
}

function EventPage() {
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [createdEvent, setCreatedEvent] = useState(null)
  const [registrationForm, setRegistrationForm] = useState({ name: '', department: '', position: '' })
  const [events, setEvents] = useState(() => getEvents())
  const [viewDate, setViewDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(() => getMyanmarDateKey(new Date()))
  const [eventFilter, setEventFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('today')

  useEffect(() => {
    const syncEvents = () => setEvents(getEvents())
    window.addEventListener(EVENT_STORAGE_EVENT, syncEvents)
    return () => window.removeEventListener(EVENT_STORAGE_EVENT, syncEvents)
  }, [])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm()

  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0)
  const calendarStart = new Date(monthStart)
  calendarStart.setDate(monthStart.getDate() - ((monthStart.getDay() + 6) % 7))

  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart)
    date.setDate(calendarStart.getDate() + index)
    return date
  })

  const eventsByDate = events.reduce((accumulator, event) => {
    if (!event.start_datetime) {
      return accumulator
    }

    const dateKey = getMyanmarDateKey(new Date(event.start_datetime))
    accumulator[dateKey] = accumulator[dateKey] ? [...accumulator[dateKey], event] : [event]
    return accumulator
  }, {})

  const monthEvents = events.filter((event) => {
    if (!event.start_datetime) return false
    const eventDate = new Date(event.start_datetime)
    return eventDate.getFullYear() === viewDate.getFullYear() && eventDate.getMonth() === viewDate.getMonth()
  })

  const activeDateKey =
    dateFilter === 'today'
      ? getMyanmarDateKey(new Date())
      : dateFilter === 'yesterday'
        ? (() => {
            const yesterday = new Date()
            yesterday.setDate(yesterday.getDate() - 1)
            return getMyanmarDateKey(yesterday)
          })()
        : selectedDate

  const selectedDayEvents = activeDateKey ? eventsByDate[activeDateKey] ?? [] : []
  const filteredSelectedDayEvents = selectedDayEvents.filter((event) => {
    const startTime = new Date(event.start_datetime).getTime()
    const isUpcoming = startTime >= Date.now()

    if (eventFilter === 'all') return true
    if (eventFilter === 'upcoming') return isUpcoming
    if (eventFilter === 'past') return !isUpcoming
    return true
  })

  const handleCopyEventLink = async () => {
    if (!createdEvent) {
      return
    }

    const shareUrl = `${window.location.origin}/event/register/${createdEvent.id}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 1800)
    } catch (error) {
      console.error('Copy failed:', error)
      window.prompt('Copy this link:', shareUrl)
    }
  }

  const handleRegistrationSubmit = (event) => {
    event.preventDefault()

    if (!createdEvent || !registrationForm.name.trim()) {
      return
    }

    setIsRegistering(true)

    try {
      addEventRegistration({
        eventId: createdEvent.id,
        name: registrationForm.name.trim(),
        department: registrationForm.department.trim(),
        position: registrationForm.position.trim(),
      })

      setRegistrationForm({ name: '', department: '', position: '' })
      setIsRegistrationModalOpen(false)
      setCreatedEvent(null)
      setLinkCopied(false)
      navigate(`/event`)
    } catch (error) {
      console.error('Registration save error:', error)
    } finally {
      setIsRegistering(false)
    }
  }

  const onSubmit = async (data) => {
    const payload = {
      title: data.title,
      start_datetime: toMyanmarDateTime(data.startDateTime),
      end_datetime: toMyanmarDateTime(data.endDateTime),
      location: data.location,
      speaker_trainer: data.speakerTrainer,
      description: data.description,
      timezone: 'Asia/Yangon',
      attendance: 0,
    }

    if (!payload.start_datetime || !payload.end_datetime) {
      Swal.fire({
        title: 'Invalid date range',
        text: 'Please provide valid start and end times before creating the event.',
        icon: 'warning',
        confirmButtonColor: '#f59e0b',
      })
      return
    }

    setIsSubmitting(true)

    try {
      const newEvent = addEvent(payload)
      setEvents(getEvents())
      setCreatedEvent(newEvent)
      setRegistrationForm({ name: '', department: '', position: '' })
      setIsRegistrationModalOpen(true)

      Swal.fire({
        title: 'Event created!',
        text: `The event "${data.title}" was saved locally in your browser.`,
        icon: 'success',
        confirmButtonColor: '#2563eb',
      })

      reset()
      setIsModalOpen(false)
    } catch (error) {
      console.error('Event save error:', error)

      Swal.fire({
        title: 'Unable to save event',
        text: 'Your browser storage is unavailable. Please check local storage permissions and try again.',
        icon: 'error',
        confirmButtonColor: '#dc2626',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="w-full space-y-4 rounded-none bg-white p-3 shadow-none ring-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Event</p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-700"
        >
          Create Event
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-100"
            >
              Prev
            </button>

            <h2 className="text-sm font-bold text-slate-900">
              {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(viewDate)}
            </h2>

            <button
              type="button"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-100"
            >
              Next
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarDays.map((date) => {
              const key = getLocalDateKey(date)
              const dayEvents = eventsByDate[key] ?? []
              const isCurrentMonth = date.getMonth() === viewDate.getMonth()
              const isToday = date.toDateString() === new Date().toDateString()
              const hasEvents = dayEvents.length > 0
              const isSelected = selectedDate === key

              return (
                <div
                  key={key}
                  onClick={() => setSelectedDate(key)}
                  className={`min-h-[74px] cursor-pointer rounded-md border p-1 transition sm:min-h-[72px] ${
                    isCurrentMonth ? 'border-slate-200' : 'border-slate-100 bg-slate-100 text-slate-400'
                  } ${hasEvents ? 'bg-emerald-50 hover:bg-emerald-100' : 'bg-white hover:bg-slate-50'} ${isSelected ? 'ring-1 ring-sky-400' : ''} ${isToday ? 'ring-1 ring-emerald-300 ring-offset-0' : ''}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`text-[10px] font-semibold ${isCurrentMonth ? 'text-slate-700' : 'text-slate-400'}`}>
                      {date.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="rounded-full bg-emerald-100 px-1 py-[1px] text-[7px] font-bold text-emerald-700">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 1).map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={(itemClickEvent) => {
                          itemClickEvent.stopPropagation()
                          navigate(`/event/${event.id}`)
                        }}
                        className="w-full rounded-sm bg-emerald-100 px-1 py-[2px] text-left text-[7px] font-medium text-emerald-800 transition hover:bg-emerald-200"
                      >
                        <div className="truncate font-semibold">{event.title}</div>
                      </button>
                    ))}

                    {dayEvents.length > 1 && (
                      <div className="text-[7px] font-medium text-slate-500">+{dayEvents.length - 1}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-violet-600">Today</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">
                {new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(parseLocalDateKey(selectedDate))}
              </h3>
            </div>
<div className="mb-4 flex flex-col gap-2 text-[10px] font-semibold sm:flex-row sm:items-center sm:justify-end">
            <select
              value={dateFilter}
              onChange={(event) => {
                const nextValue = event.target.value
                setDateFilter(nextValue)

                if (nextValue === 'today') {
                  setSelectedDate(getMyanmarDateKey(new Date()))
                }

                if (nextValue === 'yesterday') {
                  const yesterday = new Date()
                  yesterday.setDate(yesterday.getDate() - 1)
                  setSelectedDate(getMyanmarDateKey(yesterday))
                }

                if (nextValue === 'custom') {
                  setSelectedDate(getMyanmarDateKey(new Date()))
                }
              }}
              className="w-full rounded-full border border-violet-200 bg-violet-600 px-3 py-1.5 text-white outline-none ring-0 transition hover:bg-violet-700 sm:w-auto"
            >
              <option value="today" className="bg-white text-slate-700">Today</option>
              <option value="yesterday" className="bg-white text-slate-700">Yesterday</option>
              <option value="custom" className="bg-white text-slate-700">Custom</option>
            </select>

            {dateFilter === 'custom' && (
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="w-full rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-700 outline-none transition focus:border-violet-400 sm:w-auto"
              />
            )}
          </div>

          
          </div>

     
          {filteredSelectedDayEvents.length === 0 ? (
            <div className="rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
              No events for this filter.
            </div>
          ) : (
            <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredSelectedDayEvents.map((event) => (
                <article key={event.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{event.title}</h4>
                      <p className="mt-1 text-[11px] text-slate-500">{event.location}</p>
                    </div>
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-semibold text-violet-700">
                      {new Date(event.start_datetime).getTime() >= Date.now() ? 'Upcoming' : 'Past'}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                    <p>
                      <span className="font-semibold text-slate-700">Time:</span> {formatDateTime(event.start_datetime)}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-700">Speaker:</span> {event.speaker_trainer}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">
                      {getEventRegistrations(event.id).length} registered
                    </span>

                    <button
                      type="button"
                      onClick={() => navigate(`/event/${event.id}`)}
                      className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-sky-700"
                    >
                      Details
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {isRegistrationModalOpen && createdEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-4 shadow-2xl sm:p-6">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">Register</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">{createdEvent.title}</h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsRegistrationModalOpen(false)
                  setCreatedEvent(null)
                  setLinkCopied(false)
                }}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-sky-700">Public registration link</p>
                  <p className="mt-1 text-xs text-slate-600">Everyone</p>
                </div>

                <button
                  type="button"
                  onClick={handleCopyEventLink}
                  className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  {linkCopied ? 'Copied!' : 'Copy link (Everyone)'}
                </button>
              </div>
            </div>

            <form onSubmit={handleRegistrationSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Name</label>
                <input
                  type="text"
                  value={registrationForm.name}
                  onChange={(event) => setRegistrationForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-sky-500"
                  placeholder="Enter full name"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Department</label>
                <input
                  type="text"
                  value={registrationForm.department}
                  onChange={(event) => setRegistrationForm((current) => ({ ...current, department: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-sky-500"
                  placeholder="Human Resources"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Position</label>
                <input
                  type="text"
                  value={registrationForm.position}
                  onChange={(event) => setRegistrationForm((current) => ({ ...current, position: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-sky-500"
                  placeholder="Team Lead"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegistrationModalOpen(false)
                    setCreatedEvent(null)
                    setLinkCopied(false)
                  }}
                  className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Skip
                </button>

                <button
                  type="submit"
                  disabled={isRegistering}
                  className="rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400"
                >
                  {isRegistering ? 'Registering...' : 'Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-4 shadow-2xl sm:p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Create Event</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">Event / Training Details</h2>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">Event / Training Title</label>
                <input
                  type="text"
                  {...register('title', { required: 'Event title is required' })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-sky-500"
                  placeholder="Annual Team Summit"
                />
                {errors.title && <p className="mt-2 text-sm text-red-500">{errors.title.message}</p>}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Start Date Time</label>
                <input
                  type="datetime-local"
                  {...register('startDateTime', { required: 'Start date and time are required' })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-sky-500"
                />
                <p className="mt-2 text-xs text-slate-500">Myanmar Time Zone (UTC+06:30)</p>
                {errors.startDateTime && <p className="mt-2 text-sm text-red-500">{errors.startDateTime.message}</p>}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">End Date Time</label>
                <input
                  type="datetime-local"
                  {...register('endDateTime', { required: 'End date and time are required' })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-sky-500"
                />
                {errors.endDateTime && <p className="mt-2 text-sm text-red-500">{errors.endDateTime.message}</p>}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Location</label>
                <input
                  type="text"
                  {...register('location', { required: 'Location is required' })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-sky-500"
                  placeholder="Yangon Convention Center"
                />
                {errors.location && <p className="mt-2 text-sm text-red-500">{errors.location.message}</p>}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Speaker / Trainer</label>
                <input
                  type="text"
                  {...register('speakerTrainer', { required: 'Speaker or trainer is required' })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-sky-500"
                  placeholder="Dr. Aye Aye"
                />
                {errors.speakerTrainer && <p className="mt-2 text-sm text-red-500">{errors.speakerTrainer.message}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  rows="4"
                  {...register('description', { required: 'Description is required' })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-sky-500"
                  placeholder="Write the event or training description here"
                />
                {errors.description && <p className="mt-2 text-sm text-red-500">{errors.description.message}</p>}
              </div>

              <div className="md:col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400"
                >
                  {isSubmitting ? 'Saving...' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

function EventRegistrationPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(() => getEvents().find((item) => item.id === eventId) ?? null)
  const [form, setForm] = useState({ name: '', department: '', position: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [copyText, setCopyText] = useState('Copy link (Everyone)')

  useEffect(() => {
    const syncEvents = () => setEvent(getEvents().find((item) => item.id === eventId) ?? null)
    window.addEventListener(EVENT_STORAGE_EVENT, syncEvents)
    return () => window.removeEventListener(EVENT_STORAGE_EVENT, syncEvents)
  }, [eventId])

  const handleCopyLink = async () => {
    if (!event) {
      return
    }

    const shareUrl = `${window.location.origin}/event/register/${event.id}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopyText('Copied!')
      window.setTimeout(() => setCopyText('Copy link (Everyone)'), 1600)
    } catch (error) {
      console.error('Copy failed:', error)
      window.prompt('Copy this link:', shareUrl)
    }
  }

  const handleSubmit = (submitEvent) => {
    submitEvent.preventDefault()
    if (!event || !form.name.trim()) {
      return
    }

    setIsSubmitting(true)

    try {
      addEventRegistration({
        eventId: event.id,
        name: form.name.trim(),
        department: form.department.trim(),
        position: form.position.trim(),
      })
      setSubmitted(true)
      setForm({ name: '', department: '', position: '' })
    } catch (error) {
      console.error('Registration error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!event) {
    return (
      <section className="space-y-6 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <button
          type="button"
          onClick={() => navigate('/event')}
          className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          ← Back
        </button>
        <div className="rounded-2xl bg-slate-50 p-6 text-slate-600">Event not found.</div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-4xl space-y-3 rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-200 sm:p-3 lg:p-4">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-black">Register The Event/Training</p>

      <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-sky-600">Event Information</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{event.title}</h2>

            <div className="mt-3 space-y-2 text-xs text-slate-600">
              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Location</p>
                <p className="mt-1 font-medium text-slate-800">{event.location}</p>
              </div>

              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Start</p>
                <p className="mt-1 font-medium text-slate-800">{formatDateTime(event.start_datetime)}</p>
              </div>

              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">End</p>
                <p className="mt-1 font-medium text-slate-800">{formatDateTime(event.end_datetime)}</p>
              </div>

              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Speaker / Trainer</p>
                <p className="mt-1 font-medium text-slate-800">{event.speaker_trainer}</p>
              </div>

              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Description</p>
                <p className="mt-1 whitespace-pre-line leading-5 text-slate-700">{event.description}</p>
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium text-sky-700">Public link</p>
                <p className="mt-1 text-[10px] text-slate-600">Everyone</p>
              </div>

              <button
                type="button"
                onClick={handleCopyLink}
                className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
              >
                {copyText}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          {submitted ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Registration submitted successfully.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 sm:p-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-violet-600">Register Form</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">Your Information</h2>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(input) => setForm((current) => ({ ...current, name: input.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-500"
                  placeholder="Enter full name"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">Department</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={(input) => setForm((current) => ({ ...current, department: input.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-500"
                  placeholder="Department name"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">Position</label>
                <input
                  type="text"
                  value={form.position}
                  onChange={(input) => setForm((current) => ({ ...current, position: input.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-500"
                  placeholder="Job position"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-400"
                >
                  {isSubmitting ? 'Registering...' : 'Register'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

function EventDetailPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(() => getEvents().find((item) => item.id === eventId) ?? null)
  const [registrations, setRegistrations] = useState(() => getEventRegistrations(eventId))
  const [searchTerm, setSearchTerm] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    location: '',
    speaker_trainer: '',
    description: '',
    start_datetime: '',
    end_datetime: '',
  })

  const toDateTimeLocal = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return ''
    }

    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 16)
  }

  useEffect(() => {
    const syncEvents = () => {
      const nextEvent = getEvents().find((item) => item.id === eventId) ?? null
      setEvent(nextEvent)
      setRegistrations(getEventRegistrations(eventId))
    }

    window.addEventListener(EVENT_STORAGE_EVENT, syncEvents)
    return () => window.removeEventListener(EVENT_STORAGE_EVENT, syncEvents)
  }, [eventId])

  useEffect(() => {
    if (event) {
      setEditForm({
        title: event.title || '',
        location: event.location || '',
        speaker_trainer: event.speaker_trainer || '',
        description: event.description || '',
        start_datetime: toDateTimeLocal(event.start_datetime),
        end_datetime: toDateTimeLocal(event.end_datetime),
      })
    }
  }, [event])

  const filteredRegistrations = registrations.filter((registration) => {
    const searchValue = searchTerm.trim().toLowerCase()
    if (!searchValue) {
      return true
    }

    return [registration.name, registration.department, registration.position]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(searchValue))
  })

  const handleCopyEventLink = async () => {
    if (!event) {
      return
    }

    const shareUrl = `${window.location.origin}/event/register/${event.id}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      Swal.fire({
        title: 'Link copied!',
        text: 'The public registration link has been copied to your clipboard.',
        icon: 'success',
        timer: 1800,
        showConfirmButton: false,
      })
    } catch (error) {
      console.error('Copy failed:', error)
      window.prompt('Copy this link:', shareUrl)
    }
  }

  const handleSaveEdit = () => {
    if (!event) {
      return
    }

    const storedEvents = getEvents()
    const updatedEvents = storedEvents.map((item) => {
      if (item.id !== event.id) {
        return item
      }

      return {
        ...item,
        title: editForm.title.trim() || item.title,
        location: editForm.location.trim() || item.location,
        speaker_trainer: editForm.speaker_trainer.trim() || item.speaker_trainer,
        description: editForm.description.trim() || item.description,
        start_datetime: toMyanmarDateTime(editForm.start_datetime),
        end_datetime: toMyanmarDateTime(editForm.end_datetime),
      }
    })

    window.localStorage.setItem('nosh_ems_events', JSON.stringify(updatedEvents))
    window.dispatchEvent(new Event(EVENT_STORAGE_EVENT))

    const updatedEvent = updatedEvents.find((item) => item.id === event.id) ?? event
    setEvent(updatedEvent)
    setIsEditing(false)
  }

  const handleDeleteEvent = () => {
    if (!event) {
      return
    }

    const confirmed = window.confirm(`Delete "${event.title}" and its registrations?`)
    if (!confirmed) {
      return
    }

    const storedEvents = getEvents().filter((item) => item.id !== event.id)
    window.localStorage.setItem('nosh_ems_events', JSON.stringify(storedEvents))

    const storedRegistrations = JSON.parse(window.localStorage.getItem('nosh_ems_event_registrations') || '[]')
    const remainingRegistrations = storedRegistrations.filter((item) => item.eventId !== event.id)
    window.localStorage.setItem('nosh_ems_event_registrations', JSON.stringify(remainingRegistrations))

    window.dispatchEvent(new Event(EVENT_STORAGE_EVENT))
    navigate('/event')
  }

  const handleExportCsv = () => {
    if (registrations.length === 0) {
      return
    }

    const csvRows = [
      ['Name', 'Department', 'Position'],
      ...registrations.map((registration) => [
        registration.name || '',
        registration.department || '',
        registration.position || '',
      ]),
    ]

    const csvContent = csvRows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(event?.title || 'event').replace(/\s+/g, '-').toLowerCase()}-registrations.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (!event) {
    return (
      <section className="space-y-6 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <button
          type="button"
          onClick={() => navigate('/event')}
          className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          ← Back
        </button>
        <div className="rounded-2xl bg-slate-50 p-6 text-slate-600">Event not found.</div>
      </section>
    )
  }

  return (
    <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <button
        type="button"
        onClick={() => navigate('/event')}
        className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        ← Back
      </button>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.6fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-600">Event Information</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{event.title}</h1>
            </div>

            <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-semibold text-violet-700">
              {new Date(event.start_datetime).getTime() >= Date.now() ? 'Upcoming' : 'Past'}
            </span>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopyEventLink}
              className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-700"
            >
              Copy Link
            </button>
            <button
              type="button"
              onClick={() => setIsEditing((current) => !current)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
            >
              {isEditing ? 'Cancel' : 'Edit'}
            </button>
            <button
              type="button"
              onClick={handleDeleteEvent}
              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100"
            >
              Delete
            </button>
          </div>

          {isEditing ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4">
              <div className="w-full max-w-lg rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-slate-200 sm:p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-violet-600">Edit Event</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">Update details</h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Close
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Title</label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(input) => setEditForm((current) => ({ ...current, title: input.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Start</label>
                      <input
                        type="datetime-local"
                        value={editForm.start_datetime}
                        onChange={(input) => setEditForm((current) => ({ ...current, start_datetime: input.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">End</label>
                      <input
                        type="datetime-local"
                        value={editForm.end_datetime}
                        onChange={(input) => setEditForm((current) => ({ ...current, end_datetime: input.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Location</label>
                    <input
                      type="text"
                      value={editForm.location}
                      onChange={(input) => setEditForm((current) => ({ ...current, location: input.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Speaker / Trainer</label>
                    <input
                      type="text"
                      value={editForm.speaker_trainer}
                      onChange={(input) => setEditForm((current) => ({ ...current, speaker_trainer: input.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Description</label>
                    <textarea
                      rows="4"
                      value={editForm.description}
                      onChange={(input) => setEditForm((current) => ({ ...current, description: input.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="rounded-lg bg-sky-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-sky-700"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="space-y-3 text-xs text-slate-600">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Location</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{event.location}</p>
                </div>

                <div>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Registered</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{registrations.length}</p>
                </div>

                <div>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Start</p>
                  <p className="mt-1 text-sm text-slate-700">{formatDateTime(event.start_datetime)}</p>
                </div>

                <div>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">End</p>
                  <p className="mt-1 text-sm text-slate-700">{formatDateTime(event.end_datetime)}</p>
                </div>

                <div>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Speaker / Trainer</p>
                  <p className="mt-1 text-sm text-slate-700">{event.speaker_trainer}</p>
                </div>

                <div>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Description</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-5 text-slate-700">{event.description}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-violet-600">Registered Data</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">Attendees</h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={registrations.length === 0}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export CSV
              </button>
              <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-semibold text-violet-700">
                {registrations.length}
              </span>
            </div>
          </div>

          <div className="mb-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(input) => setSearchTerm(input.target.value)}
              placeholder="Search by name, department, or position"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-500"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Department</th>
                    <th className="px-3 py-2 font-semibold">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegistrations.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="px-3 py-5 text-center text-slate-500">
                        {registrations.length === 0 ? 'No registration data yet.' : 'No matching registrations found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredRegistrations.map((registration) => (
                      <tr key={registration.id} className="border-t border-slate-200">
                        <td className="px-3 py-2 font-medium text-slate-800">{registration.name || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{registration.department || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{registration.position || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function EventReportPage() {
  const [summary, setSummary] = useState(() => getEventSummary())
  const [events, setEvents] = useState(() => getEvents())
  const [filter, setFilter] = useState('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)

  useEffect(() => {
    const syncSummary = () => {
      setSummary(getEventSummary())
      setEvents(getEvents())
    }

    window.addEventListener(EVENT_STORAGE_EVENT, syncSummary)
    return () => window.removeEventListener(EVENT_STORAGE_EVENT, syncSummary)
  }, [])

  const now = new Date()

  const getStartOfWeek = (date) => {
    const value = new Date(date)
    const day = value.getDay()
    const adjusted = day === 0 ? 6 : day - 1
    value.setDate(value.getDate() - adjusted)
    value.setHours(0, 0, 0, 0)
    return value
  }

  const getEndOfWeek = (date) => {
    const value = new Date(getStartOfWeek(date))
    value.setDate(value.getDate() + 6)
    value.setHours(23, 59, 59, 999)
    return value
  }

  const getStartOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1)
  const getEndOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)

  const filteredEvents = events.filter((event) => {
    if (!event.start_datetime) {
      return false
    }

    const start = new Date(event.start_datetime).getTime()

    if (filter === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()
      return start >= todayStart && start <= todayEnd
    }

    if (filter === 'week') {
      const startOfWeek = getStartOfWeek(now)
      const endOfWeek = getEndOfWeek(now)
      return start >= startOfWeek.getTime() && start <= endOfWeek.getTime()
    }

    if (filter === 'month') {
      const startOfMonth = getStartOfMonth(now)
      const endOfMonth = getEndOfMonth(now)
      return start >= startOfMonth.getTime() && start <= endOfMonth.getTime()
    }

    if (filter === 'custom') {
      if (!customStart && !customEnd) {
        return true
      }

      const startRange = customStart ? new Date(`${customStart}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY
      const endRange = customEnd ? new Date(`${customEnd}T23:59:59`).getTime() : Number.POSITIVE_INFINITY

      return start >= startRange && start <= endRange
    }

    return true
  })

  const reportData = [
    { label: 'Total Events', value: summary.total },
    { label: 'Upcoming', value: summary.upcoming },
    { label: 'Completed', value: summary.completed },
    { label: 'Attendance', value: summary.attendance },
  ]

  const selectedRegistrations = selectedEvent ? getEventRegistrations(selectedEvent.id) : []

  const handleExportCsv = () => {
    if (filteredEvents.length === 0) {
      return
    }

    const csvRows = [
      ['Title', 'Date', 'Location', 'Registered', 'Status'],
      ...filteredEvents.map((event) => {
        const registered = getEventRegistrations(event.id).length
        const status = new Date(event.end_datetime || event.start_datetime).getTime() < Date.now() ? 'Past' : 'Upcoming'

        return [event.title || '', formatDateTime(event.start_datetime), event.location || '', String(registered), status]
      }),
    ]

    const csvContent = csvRows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'event-report.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExportSelectedRegistrations = () => {
    if (!selectedEvent) {
      return
    }

    const csvRows = [
      ['Name', 'Department', 'Position'],
      ...selectedRegistrations.map((registration) => [
        registration.name || '',
        registration.department || '',
        registration.position || '',
      ]),
    ]

    const csvContent = csvRows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(selectedEvent.title || 'event').replace(/\s+/g, '-').toLowerCase()}-registrations.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const filterButtons = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'custom', label: 'Custom Date' },
  ]

  const formatShortDate = (value) => {
    if (!value) {
      return ''
    }

    const date = new Date(`${value}T00:00:00`)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const customRangeLabel =
    filter === 'custom' && (customStart || customEnd)
      ? `Range: ${formatShortDate(customStart || customEnd)} - ${formatShortDate(customEnd || customStart)}`
      : filter === 'custom'
        ? 'Range: custom dates'
        : ''

  return (
    <>
      <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-indigo-600">Event Report</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Overview</h1>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredEvents.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {filterButtons.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                filter === item.key
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {filter === 'custom' && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <div className="flex items-center justify-between gap-3 text-[9px] uppercase tracking-[0.12em] text-slate-500">
              <span className="font-semibold">Date Range</span>
              <span className="normal-case tracking-normal text-slate-600">{customRangeLabel}</span>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">From</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(input) => setCustomStart(input.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500"
                />
              </div>

              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">To</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(input) => setCustomEnd(input.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500"
                />
              </div>

              {(customStart || customEnd) && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomStart('')
                    setCustomEnd('')
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {reportData.map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{item.label}</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">{item.value}</h2>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2 font-semibold">Title</th>
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Location</th>
                  <th className="px-3 py-2 font-semibold">Registered</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-3 py-6 text-center text-slate-500">
                      No events found for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((event) => {
                    const registered = getEventRegistrations(event.id).length
                    const status = new Date(event.end_datetime || event.start_datetime).getTime() < Date.now() ? 'Past' : 'Upcoming'

                    return (
                      <tr key={event.id} className="border-t border-slate-200 hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-800">{event.title}</td>
                        <td className="px-3 py-2 text-slate-600">{formatDateTime(event.start_datetime)}</td>
                        <td className="px-3 py-2 text-slate-600">{event.location || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{registered}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${
                              status === 'Past' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedEvent(event)}
                            className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-sky-700"
                          >
                            View Register
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-slate-200 sm:p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-violet-600">Register Data</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">{selectedEvent.title}</h2>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Attendee List</span>
              <button
                type="button"
                onClick={handleExportSelectedRegistrations}
                disabled={selectedRegistrations.length === 0}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export Excel
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Department</th>
                      <th className="px-3 py-2 font-semibold">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRegistrations.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="px-3 py-5 text-center text-slate-500">
                          No registration data yet.
                        </td>
                      </tr>
                    ) : (
                      selectedRegistrations.map((registration) => (
                        <tr key={registration.id} className="border-t border-slate-200">
                          <td className="px-3 py-2 font-medium text-slate-800">{registration.name || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{registration.department || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{registration.position || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function App() {
  const isRegistrationRoute = window.location.pathname.includes('/event/register/')

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-100 pt-16 text-slate-800">
        {!isRegistrationRoute && (
          <header className="fixed left-0 right-0 top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md shadow-sm">
            <nav className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2 md:px-6">
              <div className="flex items-center gap-2.5">
                <img src={logo} alt="Nosh EMS logo" className="h-9 w-9 rounded-full border-2 border-sky-200 bg-white object-cover shadow-sm" />
                <div className="text-sm font-bold tracking-tight text-slate-900">Nosh EMS</div>
              </div>

              <div className="flex items-center gap-1.5 md:gap-2">
                {navItems.map(({ to, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `rounded-full px-3 py-1.5 text-xs font-medium transition md:px-4 ${
                        isActive
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </div>
            </nav>
          </header>
        )}

        <main className="mx-auto w-full max-w-7xl px-2 py-4 md:px-4">
          <Routes>
            <Route path="/" element={<EventPage />} />
            <Route path="/event" element={<EventPage />} />
            <Route path="/event/:eventId" element={<EventDetailPage />} />
            <Route path="/event/register/:eventId" element={<EventRegistrationPage />} />
            <Route path="/event-report" element={<EventReportPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
