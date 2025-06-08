import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { InitiateMeeting } from './index.js'; 

function App() {
  const [count, setCount] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    // Check if video elements exist
    const localVideo = document.getElementById('localClientVideo')
    const remoteVideo1 = document.getElementById('remoteClientVideo1')
    const remoteVideo2 = document.getElementById('remoteClientVideo2')
    const remoteVideo3 = document.getElementById('remoteCientVideo3')
    
    if (!localVideo || !remoteVideo1 || !remoteVideo2 || !remoteVideo3) {
      setError('Video elements not found. Please refresh the page.')
    }
  }, [])

  return (
   <div className="p-20 flex justify-center">
    <div className="bg-indigo-900 rounded-xl p-10 flex flex-col items-center space-y-6">
      <h1 className='text-3xl font-bold text-white mb-4'>RiverSide</h1>
      {error && (
        <div className="bg-red-500 text-white p-2 rounded mb-4">
          {error}
        </div>
      )}
      <div className='flex space-x-4'>
          <input
          type="text"
          placeholder="Enter meeting code"
          className="border rounded px-4 py-2"
          id="meeting_code_box"
        />
        <button
          className='text-white bg-green-600 hover:bg-green-700 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-6 py-2.5 dark:bg-green-600 dark:hover:bg-green-700 focus:outline-none dark:focus:ring-green-800'
          onClick={() => InitiateMeeting("create")}
        >
          Create Meeting
        </button>
        <button
          className='text-white bg-red-600 hover:bg-red-700 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-6 py-2.5 dark:bg-red-600 dark:hover:bg-red-700 focus:outline-none dark:focus:ring-red-800'
          onClick={() => InitiateMeeting("join")}
        >
          Join Meeting
        </button>
      </div>
      <div className='flex justify-center space-x-10 mt-6'>
        <div className='flex flex-col items-center'>
          <p className='text-white mb-2'>Local Video</p>
          <video 
            autoPlay 
            playsInline
            muted
            controls 
            id="localClientVideo" 
            className='w-80 rounded-lg bg-gray-800'
          ></video>
        </div>
        <div className='flex flex-col items-center'>
          <p className='text-white mb-2'>Remote Video 1</p>
          <video 
            autoPlay 
            playsInline
            controls 
            id="remoteClientVideo1" 
            className='w-80 rounded-lg bg-gray-800'
          ></video>
        </div>
        <div className='flex flex-col items-center'>
          <p className='text-white mb-2'>Remote Video 2</p>
          <video 
            autoPlay 
            playsInline
            controls 
            id="remoteClientVideo2" 
            className='w-80 rounded-lg bg-gray-800'
          ></video>
        </div>
        <div className='flex flex-col items-center'>
          <p className='text-white mb-2'>Remote Video 3</p>
          <video 
            autoPlay 
            playsInline
            controls 
            id="remoteClientVideo3" 
            className='w-80 rounded-lg bg-gray-800'
          ></video>
        </div>
      </div>
    </div>
   </div>
  )
}

export default App
