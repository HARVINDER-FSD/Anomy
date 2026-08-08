import React, { useRef, useEffect } from 'react'; 
 import { Pressable, StyleSheet } from 'react-native'; 
 import LottieView from 'lottie-react-native'; 
 
 interface LottieEmojiProps { 
   source: any; 
   style?: any; 
   autoPlay?: boolean; 
   onPress?: () => void; 
   onLongPress?: () => void;
 } 
 
 export const LottieEmoji = ({ 
   source, 
   style, 
   autoPlay = false, 
   onPress, 
   onLongPress,
 }: LottieEmojiProps) => { 
   const lottieRef = useRef<LottieView>(null); 
 
   useEffect(() => { 
     if (autoPlay) { 
       const timer = setTimeout(() => { 
         lottieRef.current?.play(); 
       }, 50); 
       return () => clearTimeout(timer); 
     } 
   }, [autoPlay, source]); 
 
   const handlePress = () => { 
     lottieRef.current?.reset(); 
     lottieRef.current?.play(); 
 
     if (onPress) { 
       onPress(); 
     } 
   }; 
 
   return ( 
     <Pressable onPress={handlePress} onLongPress={onLongPress} style={style}> 
       <LottieView 
         ref={lottieRef} 
         source={source} 
         style={StyleSheet.absoluteFillObject} 
         loop={true} 
         autoPlay={autoPlay} 
         resizeMode="contain" 
       /> 
     </Pressable> 
   ); 
 };
