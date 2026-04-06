
import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

declare const AMap: any;

interface MapPickerProps {
  onLocationChange: (location: { lat: number; lng: number; address: string }) => void;
  initialLocation?: { lat: number; lng: number };
}

const MapPicker: React.FC<MapPickerProps> = ({ onLocationChange, initialLocation }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const geocoder = useRef<any>(null);
  const [searchAddress, setSearchAddress] = useState('');
  const [selectedAddress, setSelectedAddress] = useState('在地图上点击或拖动标记以选择位置');

  const formatCoordinateAddress = (location: { lat: number; lng: number }) =>
    `已选坐标：${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;

  useEffect(() => {
    if (mapContainer.current) {
      map.current = new AMap.Map(mapContainer.current, {
        zoom: 16,
        center: initialLocation ? [initialLocation.lng, initialLocation.lat] : undefined,
        viewMode: '3D', // 开启 3D 视图
        layers: [
            new AMap.TileLayer.Satellite(),
            new AMap.TileLayer.RoadNet(),
            new AMap.TileLayer.Traffic(),
        ],
      });

      AMap.plugin(['AMap.Geocoder', 'AMap.Marker'], () => {
        geocoder.current = new AMap.Geocoder();
        if (initialLocation) {
          addMarker(initialLocation);
          reverseGeocode(initialLocation);
        }
      });

      map.current.on('click', (e: any) => {
        const { lng, lat } = e.lnglat;
        const location = { lng, lat };
        updateMarkerPosition(location);
        reverseGeocode(location);
      });

    } else {
      toast.error("地图容器加载失败");
    }

    return () => {
      if (map.current) {
        map.current.destroy();
      }
    };
  }, [initialLocation]);

  const reverseGeocode = (location: { lat: number; lng: number }) => {
    if (!geocoder.current) {
      const fallbackAddress = formatCoordinateAddress(location);
      setSelectedAddress(fallbackAddress);
      onLocationChange({ ...location, address: fallbackAddress });
      return;
    }
    geocoder.current.getAddress([location.lng, location.lat], (status: string, result: any) => {
      if (status === 'complete' && result?.regeocode?.formattedAddress) {
        const address = result.regeocode.formattedAddress;
        setSelectedAddress(address);
        onLocationChange({ ...location, address });
      } else {
        const fallbackAddress = formatCoordinateAddress(location);
        setSelectedAddress(fallbackAddress);
        onLocationChange({ ...location, address: fallbackAddress });
      }
    });
  };

  const addMarker = (location: { lat: number; lng: number }) => {
    if (marker.current) {
      marker.current.setPosition([location.lng, location.lat]);
    } else {
      marker.current = new AMap.Marker({
        position: [location.lng, location.lat],
        draggable: true,
      });
      map.current.add(marker.current);

      marker.current.on('dragend', (e: any) => {
        const { lng, lat } = e.lnglat;
        const newLocation = { lng, lat };
        reverseGeocode(newLocation);
      });
    }
    map.current.setCenter([location.lng, location.lat]);
  };

  const updateMarkerPosition = (location: { lat: number; lng: number }) => {
    addMarker(location);
  };

  const handleSearch = () => {
    if (!searchAddress || !geocoder.current) return;
    geocoder.current.getLocation(searchAddress, (status: string, result: any) => {
      if (status === 'complete' && result.geocodes.length) {
        const location = result.geocodes[0].location;
        const { lng, lat } = location;
        const newLocation = { lng, lat };
        updateMarkerPosition(newLocation);
        reverseGeocode(newLocation);
      } else {
        toast.error('地址解析失败');
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input 
          type="text" 
          value={searchAddress} 
          onChange={(e) => setSearchAddress(e.target.value)}
          placeholder="输入地址进行搜索"
          className="input flex-grow"
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button type="button" onClick={handleSearch} className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg">搜索</button>
      </div>
      <div ref={mapContainer} className="w-full h-72 rounded-lg border" />
      <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded-md">
        <span className="font-semibold">当前位置:</span> {selectedAddress}
      </div>
    </div>
  );
};

export default MapPicker;
