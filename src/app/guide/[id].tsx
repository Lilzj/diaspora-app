import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, FlatList, Share, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { mockGuides, mockAuthors, mockComments } from '@/mocks/community-data';
import { AuthorExpertise } from '@/components/AuthorExpertise';
import { GuideQualityBadge } from '@/components/GuideQualityBadge';
import { VersionChanges } from '@/components/VersionChanges';
import { Image } from 'expo-image';
import { useBookmarkStore } from '@/store/bookmarks';
import { useSavedStore } from '@/store/saved';
import { ReportModal } from '@/components/ReportModal';

export default function GuideReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const guide = mockGuides.find((g) => g.guideId === id);

  if (!guide) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <Text>Guide not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-primary-500">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const author = mockAuthors[guide.authorId];
  
  // Local comments state to allow posting/liking in-memory
  const [localComments, setLocalComments] = useState(() => 
    mockComments.filter((c) => c.contentId === guide.guideId)
  );

  const scrollRef = useRef<ScrollView>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  // Batch 4 additions: Reading Settings
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [textSize, setTextSize] = useState<'S' | 'M' | 'L' | 'XL'>('M');
  const [readingTheme, setReadingTheme] = useState<'sepia' | 'light' | 'dark'>('light');
  
  // Audio Player states
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0.2); // mock progress

  // Version Timeline state
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  
  // Local replies/inputs
  const [newCommentText, setNewCommentText] = useState('');
  const [replyInputText, setReplyInputText] = useState<Record<string, string>>({});
  const [activeReplyBoxId, setActiveReplyBoxId] = useState<string | null>(null);
  const [collapsedComments, setCollapsedComments] = useState<Record<string, boolean>>({});

  // Report Modal states
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportTargetType, setReportTargetType] = useState<'Guide' | 'Comment'>('Guide');
  const [reportTargetId, setReportTargetId] = useState<string>('');

  const { getBookmark, setBookmark } = useBookmarkStore();
  const activeBookmark = getBookmark(guide.guideId);

  const { save, unsave, isSaved } = useSavedStore();
  const isDownloadedOffline = isSaved(guide.guideId);

  // Check if there is an existing bookmark to resume
  useEffect(() => {
    if (activeBookmark && activeBookmark.scrollPosition > 0.05) {
      setShowResumeBanner(true);
    }
  }, [activeBookmark]);

  // Simulated Audio Playback progress ticks
  useEffect(() => {
    let interval: any;
    if (audioPlaying) {
      interval = setInterval(() => {
        setAudioProgress((prev) => (prev >= 1 ? 0 : prev + 0.02));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [audioPlaying]);

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const heightDiff = contentSize.height - layoutMeasurement.height;
    if (heightDiff > 0) {
      const progress = contentOffset.y / heightDiff;
      setScrollProgress(progress);
      
      // Auto-save scroll position to bookmark store every 3 seconds of scrolling
      if (Math.abs(progress - (activeBookmark?.scrollPosition || 0)) > 0.08) {
        setBookmark(guide.guideId, 'sec-default', progress);
      }
    }
  };

  const resumeReading = () => {
    if (activeBookmark && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: activeBookmark.scrollPosition * 1200, // mock multiplier
          animated: true,
        });
        setShowResumeBanner(false);
      }, 100);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out this helpful guide on Diaspora: "${guide.title}" by ${author.name}`,
        url: `https://diaspora.app/guide/${guide.guideId}`,
      });
    } catch {
      // ignored
    }
  };

  const handleReport = () => {
    setReportTargetType('Guide');
    setReportTargetId(guide.guideId);
    setReportModalVisible(true);
  };

  const handleReportComment = (commentId: string) => {
    setReportTargetType('Comment');
    setReportTargetId(commentId);
    setReportModalVisible(true);
  };

  // Remaining reading time calculation
  const wordsCount = guide.content.split(/\s+/).length;
  // standard WPM of 200
  const readingSpeedWPM = 200;
  const remainingTimeMinutes = Math.max(
    1,
    Math.ceil((wordsCount * (1 - scrollProgress)) / readingSpeedWPM)
  );

  // Toggle download/offline cache
  const toggleOfflineDownload = () => {
    if (isDownloadedOffline) {
      unsave(guide.guideId);
      Alert.alert('Offline Caching', 'Guide has been removed from offline database.');
    } else {
      save(guide.guideId, 'Guide');
      Alert.alert('Offline Caching', 'Successfully downloaded! This guide will remain available without internet access.');
    }
  };

  // Like/Helpful actions
  const [helpfulCount, setHelpfulCount] = useState(guide.helpfulCount);
  const [isHelpfulActive, setIsHelpfulActive] = useState(false);
  const handleHelpfulPress = () => {
    if (isHelpfulActive) {
      setHelpfulCount((c) => c - 1);
      setIsHelpfulActive(false);
    } else {
      setHelpfulCount((c) => c + 1);
      setIsHelpfulActive(true);
    }
  };

  // Add Comment Reply
  const handlePostReply = (parentId: string) => {
    const text = replyInputText[parentId];
    if (!text?.trim()) return;

    const newReply = {
      commentId: `reply-${Date.now()}`,
      contentType: 'Guide',
      contentId: guide.guideId,
      authorId: 'user-123',
      authorName: 'Amara Kone',
      authorReputationLevel: 'VerifiedResident',
      parentCommentId: parentId,
      body: text,
      mentions: [],
      likeCount: 0,
      isLikedByUser: false,
      isPinned: false,
      isEdited: false,
      status: 'Active',
      replies: [],
      replyCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };

    setLocalComments((prev) => [...prev, newReply as any]);
    setReplyInputText((prev) => ({ ...prev, [parentId]: '' }));
    setActiveReplyBoxId(null);
  };

  // Add Top Level Comment
  const handlePostTopLevelComment = () => {
    if (!newCommentText.trim()) return;

    const newComment = {
      commentId: `cmt-${Date.now()}`,
      contentType: 'Guide',
      contentId: guide.guideId,
      authorId: 'user-123',
      authorName: 'Amara Kone',
      authorReputationLevel: 'VerifiedResident',
      parentCommentId: null,
      body: newCommentText.trim(),
      mentions: [],
      likeCount: 0,
      isLikedByUser: false,
      isPinned: false,
      isEdited: false,
      status: 'Active',
      replies: [],
      replyCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };

    setLocalComments((prev) => [newComment as any, ...prev]);
    setNewCommentText('');
    Alert.alert('Comment Posted', 'Your comment has been added to the discussion thread!');
  };

  // Toggle Comment Like
  const handleLikeComment = (commentId: string) => {
    setLocalComments((prev) =>
      prev.map((c) => {
        if (c.commentId === commentId) {
          const isLiked = !c.isLikedByUser;
          return {
            ...c,
            isLikedByUser: isLiked,
            likeCount: isLiked ? c.likeCount + 1 : c.likeCount - 1,
          };
        }
        return c;
      })
    );
  };

  // Toggle collapse threads
  const toggleCollapse = (commentId: string) => {
    setCollapsedComments((prev) => ({
      ...prev,
      [commentId]: !prev[commentId],
    }));
  };

  // Filter top level and nested comments
  const topLevelComments = localComments.filter((c) => !c.parentCommentId);
  const getCommentReplies = (commentId: string) => 
    localComments.filter((c) => c.parentCommentId === commentId);

  // Related Guides List (excluding current guide)
  const relatedGuides = mockGuides.filter((g) => g.guideId !== guide.guideId).slice(0, 3);

  // Dynamic Styles for Reading Mode
  const getThemeBg = () => {
    if (!isReadingMode) return 'bg-white';
    if (readingTheme === 'sepia') return 'bg-[#FAF6EE]';
    if (readingTheme === 'dark') return 'bg-[#121212]';
    return 'bg-white';
  };

  const getThemeTextColor = () => {
    if (isReadingMode && readingTheme === 'dark') return 'text-neutral-200';
    if (isReadingMode && readingTheme === 'sepia') return 'text-[#433422]';
    return 'text-neutral-800';
  };

  const getThemeTitleColor = () => {
    if (isReadingMode && readingTheme === 'dark') return 'text-white';
    if (isReadingMode && readingTheme === 'sepia') return 'text-[#2C1F11]';
    return 'text-neutral-900';
  };

  const getTextSizeClass = () => {
    if (textSize === 'S') return 'text-xs';
    if (textSize === 'L') return 'text-lg';
    if (textSize === 'XL') return 'text-xl';
    return 'text-base';
  };

  // Mock Guide History versions list
  const mockVersions = [
    {
      version: 'v4 (Current)',
      date: '2026-07-08',
      author: 'Emmanuel Owusu',
      summary: 'Added Brixton market vendors and updated pricing guidelines.',
      reason: 'Community report flagged old prices.',
    },
    {
      version: 'v3',
      date: '2026-06-28',
      author: 'Emmanuel Owusu',
      summary: 'Added Woolwich section and Nigerian markets list.',
      reason: 'Expansion of West African populations in Southeast London.',
    },
    {
      version: 'v2',
      date: '2026-06-18',
      author: 'Fatima Diallo',
      summary: 'Fixed directions to Rye Lane market stalls.',
      reason: 'Typographical correction.',
    },
    {
      version: 'v1',
      date: '2026-06-10',
      author: 'Emmanuel Owusu',
      summary: 'Initial draft published.',
      reason: 'New launch publication.',
    },
  ];

  return (
    <View className={`flex-1 relative ${getThemeBg()}`}>
      
      {/* Absolute Reading Progress indicator bar */}
      <View className="absolute top-[48px] left-0 right-0 h-1 bg-neutral-100 z-30">
        <View className="h-full bg-primary-500" style={{ width: `${Math.min(scrollProgress * 100, 100)}%` }} />
      </View>

      {/* Floating Table of Contents Button (Bottom-Right) */}
      <TouchableOpacity
        onPress={() => setTocOpen(true)}
        className="absolute bottom-6 right-6 w-12 h-12 bg-neutral-900 rounded-full items-center justify-center z-40 shadow-lg shadow-black/20"
      >
        <Text className="text-white text-lg">📋</Text>
      </TouchableOpacity>

      {/* Top Navigation Bar */}
      <View className="absolute top-12 left-6 right-6 z-10 flex-row justify-between items-center">
        <TouchableOpacity
          onPress={() => router.back()}
          className="bg-black/40 rounded-full w-10 h-10 items-center justify-center"
        >
          <Text className="text-xl text-white">←</Text>
        </TouchableOpacity>
        
        <View className="flex-row items-center bg-black/40 rounded-full px-2 py-1 gap-1.5">
          {/* Toggle Reading Mode Button */}
          <TouchableOpacity
            onPress={() => setIsReadingMode(!isReadingMode)}
            className={`w-8 h-8 rounded-full items-center justify-center ${isReadingMode ? 'bg-primary-500' : 'bg-transparent'}`}
          >
            <Text className="text-sm">📖</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} className="w-8 h-8 rounded-full items-center justify-center">
            <Text className="text-white text-base">🔗</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleReport} className="w-8 h-8 rounded-full items-center justify-center">
            <Text className="text-white text-base">🚨</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        bounces={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
      >
        {/* Cover Image - Hidden in Dark/Reading mode to focus on text */}
        {(!isReadingMode || readingTheme !== 'dark') && (
          guide.coverImageUrl ? (
            <Image
              source={{ uri: guide.coverImageUrl }}
              style={{ width: '100%', height: 240 }}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View className="w-full h-[200px] bg-neutral-100 items-center justify-center">
              <Text className="text-4xl">📖</Text>
            </View>
          )
        )}

        {/* Kindle-Style Position Resume Banner */}
        {showResumeBanner && (
          <View className="bg-primary-50 border-b border-primary-100 px-6 py-3.5 flex-row items-center justify-between">
            <Text className="text-xs font-bold text-neutral-800 flex-1 mr-4">
              📖 Resume from progress {Math.round(activeBookmark!.scrollPosition * 100)}%?
            </Text>
            <View className="flex-row">
              <TouchableOpacity onPress={resumeReading} className="bg-primary-500 px-3 py-1.5 rounded-lg mr-2">
                <Text className="text-[10px] font-black text-white">Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowResumeBanner(false)} className="bg-white border border-neutral-200 px-3 py-1.5 rounded-lg">
                <Text className="text-[10px] font-bold text-neutral-600">Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Audio Synthesis Playback Panel */}
        <View className="bg-neutral-50 border-b border-neutral-200 px-6 py-3 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 mr-4">
            <TouchableOpacity
              onPress={() => setAudioPlaying(!audioPlaying)}
              className="w-10 h-10 bg-primary-500 rounded-full items-center justify-center mr-3"
            >
              <Text className="text-white font-bold">{audioPlaying ? '⏸' : '▶'}</Text>
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-xs font-bold text-neutral-800">Listen to Audio Guide</Text>
              <View className="h-1 bg-neutral-200 rounded-full w-full mt-1.5 overflow-hidden">
                <View className="h-full bg-primary-500" style={{ width: `${audioProgress * 100}%` }} />
              </View>
            </View>
          </View>
          <Text className="text-[10px] text-neutral-400 font-bold">BETA</Text>
        </View>

        {/* Reading Mode Panel Adjustments (only visible when in reading mode) */}
        {isReadingMode && (
          <View className="bg-neutral-100 border-b border-neutral-200 px-6 py-2.5 flex-row items-center justify-between">
            <View className="flex-row items-center gap-1">
              <Text className="text-xs font-bold text-neutral-500 mr-2">Fonts:</Text>
              {['S', 'M', 'L', 'XL'].map((sz) => (
                <TouchableOpacity
                  key={sz}
                  onPress={() => setTextSize(sz as any)}
                  className={`w-7 h-7 rounded items-center justify-center ${textSize === sz ? 'bg-white shadow border border-neutral-200' : ''}`}
                >
                  <Text className="text-[10px] font-bold text-neutral-700">{sz}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View className="flex-row items-center gap-1.5">
              <Text className="text-xs font-bold text-neutral-500 mr-1">Theme:</Text>
              {(['light', 'sepia', 'dark'] as const).map((th) => (
                <TouchableOpacity
                  key={th}
                  onPress={() => setReadingTheme(th)}
                  className={`px-2.5 py-1 rounded capitalize border ${
                    readingTheme === th ? 'bg-primary-500 border-primary-500' : 'bg-white border-neutral-300'
                  }`}
                >
                  <Text className={`text-[10px] font-bold ${readingTheme === th ? 'text-white' : 'text-neutral-700'}`}>
                    {th}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View className="p-6">
          {/* Category & Offline Saved toggle */}
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-[10px] text-primary-500 font-extrabold uppercase tracking-widest">
              {guide.category} · {guide.country.flag} {guide.country.name}
            </Text>
            
            {/* Offline Saved trigger */}
            <TouchableOpacity
              onPress={toggleOfflineDownload}
              className={`px-2.5 py-1 rounded-lg border ${
                isDownloadedOffline ? 'bg-[#E6F4EA] border-[#CEEAD6]' : 'bg-white border-neutral-200'
              }`}
            >
              <Text className={`text-[9px] font-black ${isDownloadedOffline ? 'text-success-default' : 'text-neutral-500'}`}>
                {isDownloadedOffline ? '✓ OFFLINE SAVED' : '📥 DOWNLOAD OFFLINE'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text className={`text-2xl font-black mb-2 leading-snug ${getThemeTitleColor()}`}>
            {guide.title}
          </Text>
          
          <View className="flex-row items-center mb-6">
            <Text className="text-xs text-neutral-400 font-bold">🕐 {remainingTimeMinutes} mins left</Text>
            <Text className="text-xs text-neutral-300 mx-2">·</Text>
            <Text className="text-xs text-neutral-400 font-bold">Last verified: {guide.lastVerifiedAt ? new Date(guide.lastVerifiedAt).toLocaleDateString() : 'N/A'}</Text>
          </View>

          {/* Author overview */}
          <AuthorExpertise
            userId={author.userId}
            name={author.name}
            reputationLevel={author.reputationLevel}
            countryVerifications={author.countryVerifications}
            expertiseCategories={author.expertiseCategories}
            followerCount={author.followerCount}
            isFollowedByUser={author.isFollowedByUser}
            variant="full"
          />

          {/* Version / Quality Dashboard */}
          <View className="bg-neutral-50 rounded-2xl p-4 my-6 border border-neutral-100 flex-row justify-between items-center">
            <View>
              <View className="flex-row items-center mb-1">
                <Text className="text-[10px] font-black text-neutral-400 uppercase tracking-wide mr-1.5">Version Timeline</Text>
                <TouchableOpacity onPress={() => setVersionModalOpen(true)} className="bg-neutral-200 px-2 py-0.5 rounded">
                  <Text className="text-[9px] font-extrabold text-neutral-700">v{guide.versionCount} History →</Text>
                </TouchableOpacity>
              </View>
              <Text className="text-[10px] text-neutral-500">Updated: {new Date(guide.lastUpdatedAt).toLocaleDateString()}</Text>
            </View>
            <GuideQualityBadge label={guide.qualityLabel} size="md" />
          </View>

          {/* Content Body */}
          <View className="mb-8">
            <Text className={`leading-relaxed ${getThemeTextColor()} ${getTextSizeClass()} ${
              isReadingMode ? 'line-height-6 select-text' : ''
            }`}>
              {guide.content}
            </Text>
          </View>

          {/* Version Changes Summary card */}
          <View className="mb-8">
            <VersionChanges
              versionNumber={guide.versionCount}
              updatedAt={guide.lastUpdatedAt}
              changeSummary={guide.latestChangeSummary}
              authorName={author.name}
              onViewAllVersions={() => setVersionModalOpen(true)}
            />
          </View>

          {/* Community Reactions & trust confidence details */}
          <View className="bg-neutral-50 rounded-2xl p-4 mb-8 border border-neutral-100">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Community Confidence Signals</Text>
            <View className="flex-row justify-between mb-4">
              <Text className="text-xs text-neutral-600 font-semibold">👍 {helpfulCount} Helpful votes</Text>
              <Text className="text-xs text-success-default font-extrabold">🛡️ Verified by Local Residents</Text>
            </View>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={handleHelpfulPress}
                className={`flex-1 border py-3 rounded-xl items-center flex-row justify-center gap-1.5 ${
                  isHelpfulActive ? 'bg-primary-50 border-primary-200' : 'bg-white border-neutral-200'
                }`}
              >
                <Text className="text-base">{isHelpfulActive ? '❤️' : '👍'}</Text>
                <Text className={`text-xs font-bold ${isHelpfulActive ? 'text-primary-500' : 'text-neutral-700'}`}>
                  {isHelpfulActive ? 'Marked Helpful' : 'Mark Helpful'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Alert.alert('Details Confirmed', 'Thank you for verifying! Your vote strengthens the trust ranking of this guide.')}
                className="flex-1 bg-white border border-neutral-200 py-3 rounded-xl items-center flex-row justify-center gap-1.5"
              >
                <Text className="text-base">✓</Text>
                <Text className="text-xs font-bold text-neutral-700">Confirm Details</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Threaded Discussions Section */}
          <View className="mb-8">
            <Text className="text-lg font-black text-neutral-900 mb-4">💬 Threaded Comments</Text>
            
            {/* New Top Level Comment Input */}
            <View className="mb-6 bg-white p-3.5 rounded-2xl border border-neutral-200 shadow-sm">
              <TextInput
                placeholder="Share your thoughts or ask a question..."
                value={newCommentText}
                onChangeText={setNewCommentText}
                className="text-xs p-2 bg-neutral-50 rounded-xl border border-neutral-100 min-h-[50px] text-neutral-800 font-semibold"
                multiline
                maxLength={300}
              />
              <View className="flex-row justify-between items-center mt-3 pt-2 border-t border-neutral-100">
                <Text className="text-[10px] text-neutral-400 font-semibold">Commenting as Amara Kone</Text>
                <TouchableOpacity
                  onPress={handlePostTopLevelComment}
                  className="bg-primary-500 px-4 py-2 rounded-xl"
                >
                  <Text className="text-[10px] font-black text-white">Post Comment</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Top Level Comments List */}
            {topLevelComments.map((comment) => {
              const isCollapsed = collapsedComments[comment.commentId];
              const commentReplies = getCommentReplies(comment.commentId);
              
              // Roles Badges
              const isAuthor = comment.authorId === guide.authorId;
              const isModerator = comment.authorName === 'Emmanuel Owusu'; // mock moderator

              return (
                <View key={comment.commentId} className="mb-4 bg-neutral-50 p-4 rounded-2xl border border-neutral-100">
                  
                  {/* Pinned label */}
                  {comment.isPinned && (
                    <View className="flex-row items-center mb-2">
                      <Text className="text-[10px] font-black text-primary-500 bg-primary-50 px-2 py-0.5 rounded border border-primary-100">
                        📌 PINNED COMMENT
                      </Text>
                    </View>
                  )}

                  <View className="flex-row items-center justify-between mb-1">
                    <View className="flex-row items-center">
                      <Text className="text-xs font-bold text-neutral-900 mr-1.5">{comment.authorName}</Text>
                      {isAuthor && (
                        <Text className="text-[8px] font-black text-white bg-primary-500 px-1 py-0.5 rounded mr-1">AUTHOR</Text>
                      )}
                      {isModerator && (
                        <Text className="text-[8px] font-black text-white bg-success-default px-1 py-0.5 rounded mr-1">MODERATOR</Text>
                      )}
                    </View>
                    <Text className="text-[10px] text-neutral-400">{new Date(comment.createdAt).toLocaleDateString()}</Text>
                  </View>

                  <Text className="text-xs text-neutral-700 mt-1 leading-relaxed">{comment.body}</Text>

                  {/* Comment interaction controls */}
                  <View className="flex-row items-center justify-between mt-3 border-t border-neutral-100 pt-2.5">
                    <View className="flex-row items-center gap-3">
                      <TouchableOpacity onPress={() => handleLikeComment(comment.commentId)} className="flex-row items-center">
                        <Text className="text-sm mr-1">{comment.isLikedByUser ? '❤️' : '♡'}</Text>
                        <Text className="text-[10px] font-bold text-neutral-500">{comment.likeCount}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setActiveReplyBoxId(activeReplyBoxId === comment.commentId ? null : comment.commentId)}
                        className="flex-row items-center"
                      >
                        <Text className="text-[10px] font-bold text-primary-500">Reply</Text>
                      </TouchableOpacity>
                      {commentReplies.length > 0 && (
                        <TouchableOpacity onPress={() => toggleCollapse(comment.commentId)}>
                          <Text className="text-[10px] font-bold text-neutral-400">
                            {isCollapsed ? `Show replies (${commentReplies.length})` : 'Collapse Thread'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    
                    <TouchableOpacity onPress={() => handleReportComment(comment.commentId)}>
                      <Text className="text-xs text-neutral-400 font-bold">Report</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Reply Write-in input box */}
                  {activeReplyBoxId === comment.commentId && (
                    <View className="mt-3 bg-white p-2.5 rounded-xl border border-neutral-200">
                      <TextInput
                        placeholder="Write a reply..."
                        value={replyInputText[comment.commentId] || ''}
                        onChangeText={(text) => setReplyInputText((prev) => ({ ...prev, [comment.commentId]: text }))}
                        className="text-xs p-1"
                        maxLength={200}
                      />
                      <View className="flex-row justify-end mt-2">
                        <TouchableOpacity
                          onPress={() => handlePostReply(comment.commentId)}
                          className="bg-primary-500 px-3 py-1.5 rounded-lg"
                        >
                          <Text className="text-[9px] font-black text-white">Post Reply</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Indented Thread Replies */}
                  {!isCollapsed && commentReplies.length > 0 && (
                    <View className="mt-3 pl-4 border-l-2 border-neutral-200 gap-3">
                      {commentReplies.map((reply) => {
                        const isReplyAuthor = reply.authorId === guide.authorId;
                        return (
                          <View key={reply.commentId} className="bg-white p-3 rounded-xl border border-neutral-100">
                            <View className="flex-row items-center justify-between mb-1">
                              <View className="flex-row items-center">
                                <Text className="text-[11px] font-bold text-neutral-800 mr-1.5">{reply.authorName}</Text>
                                {isReplyAuthor && (
                                  <Text className="text-[8px] font-black text-white bg-primary-500 px-1 py-0.5 rounded">AUTHOR</Text>
                                )}
                              </View>
                              <Text className="text-[9px] text-neutral-400">{new Date(reply.createdAt).toLocaleDateString()}</Text>
                            </View>
                            <Text className="text-xs text-neutral-600 leading-relaxed">{reply.body}</Text>
                            <View className="flex-row items-center gap-3 mt-2">
                              <TouchableOpacity onPress={() => handleLikeComment(reply.commentId)} className="flex-row items-center">
                                <Text className="text-xs mr-1">{reply.isLikedByUser ? '❤️' : '♡'}</Text>
                                <Text className="text-[9px] font-bold text-neutral-500">{reply.likeCount}</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                </View>
              );
            })}
          </View>

          {/* Related Guides Recommendation Panel */}
          <View className="border-t border-neutral-100 pt-6 mb-8">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Related Guides</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-3">
              {relatedGuides.map((rel) => (
                <TouchableOpacity
                  key={rel.guideId}
                  onPress={() => router.push(`/guide/${rel.guideId}`)}
                  className="bg-white border border-neutral-200 rounded-2xl p-4 w-[240px] mr-3 shadow-sm"
                >
                  <Text className="text-[9px] font-extrabold text-primary-500 uppercase">{rel.category}</Text>
                  <Text className="text-sm font-bold text-neutral-900 mt-1 leading-snug" numberOfLines={2}>
                    {rel.title}
                  </Text>
                  <Text className="text-[10px] text-neutral-500 mt-2">🕐 {rel.readingTimeMinutes} min read</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

        </View>
        <View className="h-10" />
      </ScrollView>

      {/* Table of Contents Modal Drawer */}
      <Modal
        visible={tocOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setTocOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl p-6 min-h-[300px] shadow-2xl">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-black text-neutral-900">Table of Contents</Text>
              <TouchableOpacity onPress={() => setTocOpen(false)}>
                <Text className="text-neutral-500 font-semibold">Close</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={guide.sections}
              keyExtractor={(item) => item.sectionId}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setTocOpen(false);
                    scrollRef.current?.scrollTo({
                      y: item.order * 250,
                      animated: true,
                    });
                  }}
                  className="py-4 border-b border-neutral-100 flex-row items-center justify-between"
                >
                  <Text className="text-sm font-semibold text-neutral-800">
                    {item.order}. {item.heading}
                  </Text>
                  <Text className="text-neutral-300 text-xs">›</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Version Revisions History Modal Timeline */}
      <Modal
        visible={versionModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setVersionModalOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-3xl p-6 max-h-[85%] shadow-2xl">
            <View className="flex-row items-center justify-between mb-4 border-b border-neutral-100 pb-3">
              <View>
                <Text className="text-lg font-black text-neutral-900">Version History</Text>
                <Text className="text-xs text-neutral-400 mt-0.5">Timeline of community updates</Text>
              </View>
              <TouchableOpacity onPress={() => setVersionModalOpen(false)} className="bg-neutral-100 px-3 py-1.5 rounded-xl">
                <Text className="text-xs text-neutral-500 font-bold">Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} className="py-2">
              {mockVersions.map((ver, idx) => (
                <View key={idx} className="flex-row mb-6">
                  {/* timeline dot indicator */}
                  <View className="items-center mr-4">
                    <View className={`w-3.5 h-3.5 rounded-full items-center justify-center ${idx === 0 ? 'bg-primary-500' : 'bg-neutral-300'}`} />
                    {idx < mockVersions.length - 1 && <View className="w-0.5 bg-neutral-200 flex-1 my-1" />}
                  </View>
                  <View className="flex-1 bg-neutral-50 p-4 rounded-2xl border border-neutral-150">
                    <View className="flex-row justify-between items-center mb-1">
                      <Text className="text-sm font-black text-neutral-800">{ver.version}</Text>
                      <Text className="text-[10px] text-neutral-400 font-bold">{ver.date}</Text>
                    </View>
                    <Text className="text-[10px] text-neutral-500 font-semibold mb-2">Author: {ver.author}</Text>
                    <Text className="text-xs text-neutral-700 leading-relaxed font-semibold">🔍 Changes: {ver.summary}</Text>
                    <Text className="text-[10px] text-neutral-500 mt-1.5 italic">Reason: {ver.reason}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        contentType={reportTargetType}
        contentId={reportTargetId}
        onSubmit={(data) => {
          console.log('Reported Guide/Comment:', data);
        }}
      />
    </View>
  );
}
