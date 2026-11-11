import { useEffect, useState } from 'react';
import { loadImageStudioSource } from '../lib/newapi.js';

export default function ImageStudioSourceImage({ source, alt, ...props }) {
  const [resolved, setResolved] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let loadedSource;
    setResolved('');
    setFailed(false);
    loadImageStudioSource(source)
      .then((loaded) => {
        loadedSource = loaded;
        if (active) setResolved(loaded.url);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (loadedSource?.revoke) URL.revokeObjectURL(loadedSource.url);
    };
  }, [source]);

  return <>
    {resolved && <img src={resolved} alt={alt} {...props} />}
    {failed && <span className="image-studio-source-error" role="img" aria-label={alt}>图片读取失败</span>}
  </>;
}
