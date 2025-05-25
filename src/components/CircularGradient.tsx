
const CircularGradient = ({isSpeaking}: {isSpeaking: boolean}) => {
  return (
    <div className={`water_drop_container ${isSpeaking ? "sound_wave_active" : ""}`}>
          <div className={`water_drop_main`} />
          <div className={`water_drop_secondary`} />
          <div className={`water_drop_tertiary`} />
          <div className={`floating_particles`}>
            <div className="particle particle-1" />
            <div className="particle particle-2" />
            <div className="particle particle-3" />
            <div className="particle particle-4" />
            <div className="particle particle-5" />
          </div>
        </div>
  )
}

export default CircularGradient