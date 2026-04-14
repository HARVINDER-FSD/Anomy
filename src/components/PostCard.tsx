import React from 'react'
import { View, Text, Image, StyleSheet } from 'react-native'

interface PostCardProps {
  post: any
  currentUserId?: string
  onDelete?: () => void
  onLike?: () => void
}

export const PostCard: React.FC<PostCardProps> = ({ post, currentUserId, onDelete, onLike }) => {
  return (
    <View style={styles.container}>
      {post.image && (
        <Image source={{ uri: post.image }} style={styles.image} />
      )}
      <View style={styles.content}>
        <Text style={styles.title}>{post.title || 'Post'}</Text>
        {post.description && (
          <Text style={styles.description}>{post.description}</Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  image: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    marginBottom: 12,
  },
  content: {
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  description: {
    fontSize: 14,
    color: '#666',
  },
})
