import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet'
import { useEffect } from 'react'

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], map.getZoom())
  }, [lat, lng, map])
  return null
}

export default function FireMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  return (
    <div className="dark-tiles overflow-hidden rounded-[10px] border border-graphite" style={{ height: 360 }}>
      <MapContainer
        center={[latitude, longitude]}
        zoom={7}
        maxZoom={19}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          subdomains="abc"
          maxZoom={19}
        />
        <CircleMarker
          center={[latitude, longitude]}
          radius={10}
          pathOptions={{ color: '#cc9166', fillColor: '#cc9166', fillOpacity: 0.5, weight: 2 }}
        />
        <Recenter lat={latitude} lng={longitude} />
      </MapContainer>
    </div>
  )
}
