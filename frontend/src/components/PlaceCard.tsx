'use client'

import { useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin, Clock, DollarSign, Heart, ThumbsUp, ThumbsDown, ExternalLink } from 'lucide-react'
import VoteButton from '@/components/VoteButton'

interface PlaceCardProps {
  place: {
    textid: string;
    name: string;
    category: string;
    address: string;
    description: string;
    image_url?: string;
    price_level?: number;
    rating?: number;
    recommendation_reason?: string;
    is_recommended?: boolean;
    order_index?: number;
  };
  upVotes?: number;
  downVotes?: number;
  userVote?: 'up' | 'down' | null;
  onVote?: (placeId: string, voteType: 'up' | 'down') => void;
  onFavorite?: (placeId: string) => void;
  isFavorite?: boolean;
  showActions?: boolean;
  onClick?: () => void;
  className?: string;
}

const categoryColors: Record<string, string> = {
  'restaurant': 'bg-red-100 text-red-800',
  'cafe': 'bg-teal-100 text-teal-800',
  'attraction': 'bg-amber-100 text-amber-800',
  'culture': 'bg-purple-100 text-purple-800',
  'shopping': 'bg-blue-100 text-blue-800',
  'default': 'bg-gray-100 text-gray-800'
};

const categoryNames: Record<string, string> = {
  'restaurant': '음식점',
  'cafe': '카페',
  'attraction': '관광지',
  'culture': '문화시설',
  'shopping': '쇼핑',
  'default': '기타'
};

/**
 * 장소 카드 컴포넌트
 * 장소 정보를 표시하고 상호작용할 수 있는 카드 컴포넌트입니다.
 */
export default function PlaceCard({
  place,
  upVotes = 0,
  downVotes = 0,
  userVote = null,
  onVote,
  onFavorite,
  isFavorite = false,
  showActions = true,
  onClick,
  className
}: PlaceCardProps) {
  const [favorite, setFavorite] = useState(isFavorite)
  
  const handleFavoriteClick = () => {
    if (onFavorite) {
      setFavorite(!favorite)
      onFavorite(place.textid)
    }
  }
  
  const handleVote = (placeId: string, voteType: 'up' | 'down') => {
    if (onVote) {
      onVote(placeId, voteType)
    }
  }
  
  // 가격 수준 표시
  const renderPriceLevel = () => {
    if (!place.price_level) return null;
    
    const dollarSigns = [];
    for (let i = 0; i < place.price_level; i++) {
      dollarSigns.push(<DollarSign key={i} className="h-3 w-3" />);
    }
    
    return (
      <div className="flex items-center text-gray-500">
        {dollarSigns}
      </div>
    );
  };
  
  const category = place.category?.toLowerCase() || 'default';
  const categoryColor = categoryColors[category] || categoryColors.default;
  const categoryName = categoryNames[category] || categoryNames.default;
  
  return (
    <Card className={cn("overflow-hidden hover:shadow-md transition-shadow", className)} onClick={onClick}>
      <div className="relative">
        {place.image_url ? (
          <div className="w-full h-40 relative">
            <Image
              src={place.image_url}
              alt={place.name}
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="w-full h-40 bg-gray-200 flex items-center justify-center">
            <MapPin className="h-10 w-10 text-gray-400" />
          </div>
        )}
        
        {place.order_index !== undefined && (
          <div className="absolute top-2 left-2 bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
            {place.order_index + 1}
          </div>
        )}
        
        {place.is_recommended && (
          <Badge className="absolute top-2 right-2 bg-yellow-500">
            AI 추천
          </Badge>
        )}
      </div>
      
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{place.name}</CardTitle>
            <CardDescription className="flex items-center">
              <MapPin className="h-3 w-3 mr-1" />
              <span className="text-xs truncate max-w-[200px]">{place.address}</span>
            </CardDescription>
          </div>
          <Badge className={categoryColor}>{categoryName}</Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pb-2">
        <p className="text-sm line-clamp-2">{place.description}</p>
        
        {place.recommendation_reason && (
          <div className="mt-2 text-xs bg-yellow-50 p-2 rounded-md">
            <strong>추천 이유:</strong> {place.recommendation_reason}
          </div>
        )}
        
        <div className="mt-3 flex items-center justify-between">
          {renderPriceLevel()}
          
          {typeof place.rating === 'number' && (
            <div className="flex items-center">
              <div className="text-yellow-500 font-semibold mr-1">{place.rating.toFixed(1)}</div>
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-2 h-2 rounded-full mx-0.5 ${
                      i < Math.round(place.rating || 0) ? 'bg-yellow-500' : 'bg-gray-300'
                    }`} 
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
      
      {showActions && (
        <CardFooter className="pt-0 flex justify-between">
          <div className="flex space-x-1">
            <VoteButton 
              placeId={place.textid}
              voteType="up"
              initialCount={upVotes}
              userVoted={userVote === 'up'}
              onVote={handleVote}
              size="sm"
            />
            
            <VoteButton 
              placeId={place.textid}
              voteType="down"
              initialCount={downVotes}
              userVoted={userVote === 'down'}
              onVote={handleVote}
              size="sm"
            />
          </div>
          
          {onFavorite && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleFavoriteClick();
              }}
              className={favorite ? 'text-red-500' : 'text-gray-500'}
            >
              <Heart className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} />
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  )
} 