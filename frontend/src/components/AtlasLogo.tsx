import logoNavy from '../assets/atlasx-logo-navy.png'
import logoWhite from '../assets/atlasx-logo-white.png'

interface AtlasLogoProps {
  variant?: 'white' | 'navy'
  width?: number
}

export default function AtlasLogo({ variant = 'white', width = 160 }: AtlasLogoProps) {
  return (
    <img
      src={variant === 'white' ? logoWhite : logoNavy}
      alt="AtlasX — Sistema de Gerenciamento"
      width={width}
      draggable={false}
      style={{ display: 'block', width, height: 'auto', userSelect: 'none' }}
    />
  )
}
