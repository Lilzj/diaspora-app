import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { CategoryChip } from '@/components/CategoryChip';
import { Input } from '@/components/Input';
import { mockCategories, mockListings } from '@/mocks/data';
import { mockCountryStats, mockAuthors } from '@/mocks/community-data';
import { useTrustStore } from '@/store/trust';
import { useReputationStore } from '@/store/reputation';
import { TrustEngine } from '@/lib/trustEngine';
import type { ContentTrustLevel } from '@/types/trust';
import { ImagePickerInput } from '@/components/ImagePickerInput';

// Module-level global storage for guide drafts
let globalGuideDraft: any = null;

const steps = ['Country', 'Category', 'Basics', 'Write Content', 'Review & Preview'];

export default function CreateGuideScreen() {
  const trustStore = useTrustStore();
  const repStore = useReputationStore();
  const evaluation = TrustEngine.evaluateAction('PublishGuide', 'GB');

  const [currentStep, setCurrentStep] = useState(0);
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Form States
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [content, setContent] = useState('');

  // AI Assistant Mock States
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingText, setAiLoadingText] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);

  // Check draft and auto-select country on mount
  useEffect(() => {
    if (globalGuideDraft) {
      setDraftBannerVisible(true);
    } else {
      const verified = mockAuthors['user-123']?.countryVerifications?.filter(v => v.isVerified) || [];
      if (verified.length === 1) {
        setSelectedCountry(verified[0].countryName);
      }
    }
  }, []);

  // Save draft state periodically
  const saveDraft = () => {
    globalGuideDraft = {
      selectedCountry,
      selectedCategory,
      title,
      summary,
      coverImage,
      content,
      currentStep,
    };
  };

  useEffect(() => {
    if (title || content || selectedCountry) {
      saveDraft();
    }
  }, [selectedCountry, selectedCategory, title, summary, coverImage, content]);

  const restoreDraft = () => {
    if (globalGuideDraft) {
      const d = globalGuideDraft;
      setSelectedCountry(d.selectedCountry);
      setSelectedCategory(d.selectedCategory);
      setTitle(d.title);
      setSummary(d.summary);
      setCoverImage(d.coverImage);
      setContent(d.content);
      setCurrentStep(d.currentStep || 0);
      setDraftBannerVisible(false);
    }
  };

  const discardDraft = () => {
    globalGuideDraft = null;
    setDraftBannerVisible(false);
  };

  // AI Assistant helpers
  const triggerAiAction = (actionType: string) => {
    setAiLoading(true);
    setAiSuggestions(null);
    let text = '';
    let result = '';

    if (actionType === 'outline') {
      text = 'Analyzing topic and generating outline...';
      result = `💡 Suggested Outline for "${title || 'Your Guide'}":\n\n1. Introduction & Historical Context\n2. Key Requirements & Documentation\n3. Step-by-Step Walkthrough\n4. Common Mistakes to Avoid\n5. Local Resources & Forums`;
    } else if (actionType === 'improve') {
      text = 'Analyzing text and polishing syntax...';
      result = '✨ Polish Suggestions:\n- Try replacing "really simple to do" with "straightforward to implement".\n- Simplify paragraph 2 to improve overall readability scores.';
    } else if (actionType === 'title') {
      text = 'Synthesizing guide details for title ideas...';
      result = `📝 Suggested Titles:\n- 💡 Settlement Blueprint: Settling in ${selectedCountry || 'UK'}\n- 🏠 Navigating Accommodation in ${selectedCountry || 'Mauritius'} 101\n- 🚀 The Diaspora Handbook: Finding Community`;
    } else if (actionType === 'summarize') {
      text = 'Drafting quick executive summary...';
      result = '📌 Executive Summary:\nThis guide provides a comprehensive overview of local services and community-verified tips for new arrivals.';
    } else {
      text = 'Checking verification date stamps...';
      result = '🔍 Outdated Check:\nImmigration fees and transport links were last updated 12 months ago. Consider verifying with new data.';
    }

    setAiLoadingText(text);

    setTimeout(() => {
      setAiLoading(false);
      setAiSuggestions(result);
    }, 1500);
  };

  // Simulated Rich Text Tag appends
  const insertTag = (tagType: string) => {
    let startTag = '';
    let endTag = '';

    if (tagType === 'tip') {
      startTag = '\n[TIP]';
      endTag = 'Write your helpful tip here...[/TIP]\n';
    } else if (tagType === 'warning') {
      startTag = '\n[WARNING]';
      endTag = 'Write your caution note here...[/WARNING]\n';
    } else if (tagType === 'callout') {
      startTag = '\n[CALLOUT]';
      endTag = 'Highlight this information here...[/CALLOUT]\n';
    } else if (tagType === 'bullet') {
      startTag = '\n- Item 1\n- Item 2\n';
    } else if (tagType === 'image') {
      startTag = '\n[IMAGE]';
      endTag = 'https://images.unsplash.com/photo-1544148103-0773bf10d330?w=600[/IMAGE]\n';
    } else {
      startTag = '\n[LINK]';
      endTag = 'View Portal Name | https://portal.com[/LINK]\n';
    }

    setContent((prev) => prev + startTag + endTag);
  };

  // Custom live parser to display text formatted blocks
  const parseRichPreview = (rawText: string) => {
    if (!rawText) return <Text className="text-neutral-400 italic">No content written yet. Use the formatting toolbar to write your guide.</Text>;

    const tokens = rawText.split(/(\[TIP\][\s\S]*?\[\/TIP\]|\[WARNING\][\s\S]*?\[\/WARNING\]|\[CALLOUT\][\s\S]*?\[\/CALLOUT\]|\[IMAGE\][\s\S]*?\[\/IMAGE\]|\[LINK\][\s\S]*?\[\/LINK\])/g);

    return tokens.map((token, index) => {
      if (token.startsWith('[TIP]')) {
        const textContent = token.replace('[TIP]', '').replace('[/TIP]', '').trim();
        return (
          <View key={index} className="bg-[#E6F4EA] border-l-4 border-success-default p-3 rounded-r-xl my-2">
            <Text className="text-xs font-bold text-success-default uppercase tracking-wider mb-1">💡 Pro-Tip</Text>
            <Text className="text-sm text-neutral-800 leading-relaxed">{textContent}</Text>
          </View>
        );
      }
      if (token.startsWith('[WARNING]')) {
        const textContent = token.replace('[WARNING]', '').replace('[/WARNING]', '').trim();
        return (
          <View key={index} className="bg-[#FEF2F2] border-l-4 border-error-default p-3 rounded-r-xl my-2">
            <Text className="text-xs font-bold text-error-default uppercase tracking-wider mb-1">⚠️ Important Warning</Text>
            <Text className="text-sm text-neutral-800 leading-relaxed">{textContent}</Text>
          </View>
        );
      }
      if (token.startsWith('[CALLOUT]')) {
        const textContent = token.replace('[CALLOUT]', '').replace('[/CALLOUT]', '').trim();
        return (
          <View key={index} className="bg-[#EFF6FF] border-l-4 border-info-default p-3 rounded-r-xl my-2">
            <Text className="text-xs font-bold text-info-default uppercase tracking-wider mb-1">ℹ️ Notice Info</Text>
            <Text className="text-sm text-neutral-800 leading-relaxed">{textContent}</Text>
          </View>
        );
      }
      if (token.startsWith('[IMAGE]')) {
        const url = token.replace('[IMAGE]', '').replace('[/IMAGE]', '').trim();
        return (
          <View key={index} className="rounded-xl overflow-hidden my-3 border border-neutral-100">
            <Text className="bg-neutral-100 px-3 py-1 text-[10px] text-neutral-400 font-extrabold uppercase">Image Attachment</Text>
            <Text className="text-xs text-neutral-500 p-2" numberOfLines={1}>{url}</Text>
          </View>
        );
      }
      if (token.startsWith('[LINK]')) {
        const linkRaw = token.replace('[LINK]', '').replace('[/LINK]', '').trim();
        const parts = linkRaw.split('|');
        const label = parts[0]?.trim() || 'View Link';
        const url = parts[1]?.trim() || '#';
        return (
          <TouchableOpacity key={index} className="my-2 py-1 px-3 border border-primary-100 bg-primary-50 rounded-lg inline-flex flex-row items-center justify-between">
            <Text className="text-xs font-bold text-primary-500 underline">{label}</Text>
            <Text className="text-[10px] text-neutral-400 font-semibold">{url}</Text>
          </TouchableOpacity>
        );
      }
      return <Text key={index} className="text-sm text-neutral-800 leading-relaxed">{token}</Text>;
    });
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const readTimeMin = Math.max(Math.ceil(wordCount / 200), 1);

  const progressPct = ((currentStep + 1) / steps.length) * 100;

  const handlePublish = () => {
    // Record the rate limit hit when actually submitting/publishing
    const recordCheck = TrustEngine.evaluateAction('PublishGuide', 'GB', false);
    if (!recordCheck.allowed) {
      const errMsg = recordCheck.reason || 'Rate limit active. Please try again later.';
      Alert.alert('Rate Limit Active', errMsg);
      return;
    }

    // 1. Fraud protection - cover image reuse checks
    if (coverImage) {
      const fraudCheck = TrustEngine.detectImageReuse(coverImage);
      if (fraudCheck.fraudTriggered) {
        Alert.alert(
          'Security Exception Triggered',
          'Spam detection flagged duplicate cover photo uploads. Please choose a unique community photo to publish.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'View Guidelines', onPress: () => router.push('/profile/community-guidelines') }
          ]
        );
        return;
      }
    }

    globalGuideDraft = null;

    // 2. Content Trust Level rating
    const isExpert = repStore.reputation?.level === 'CommunityExpert' || repStore.reputation?.level === 'CommunityAmbassador';
    const contentTrust: ContentTrustLevel = isExpert ? 'Verified' : 'NeedsVerification';

    // 3. Log Audit logs and visual journey
    trustStore.addAuditLog('Guide Published', `Published guide "${title}" (trust rating: ${contentTrust})`);
    
    useTrustStore.setState((state) => {
      const hasPublishedFirstGuide = state.trustJourney.some((j) => j.type === 'PublishFirstGuide');
      const updatedJourney = [...state.trustJourney];
      
      if (!hasPublishedFirstGuide) {
        updatedJourney.push({
          eventId: `je-firstguide-${Date.now()}`,
          type: 'PublishFirstGuide',
          label: 'Published First Guide',
          timestamp: new Date().toISOString().split('T')[0],
          icon: '📖',
          description: `Wrote and published first blueprint: "${title}"`,
        });
      }

      return {
        trustJourney: updatedJourney,
      };
    });

    Alert.alert(
      'Guide Submitted',
      isExpert 
        ? 'Your guide has been published immediately to the Diaspora network.'
        : 'Your guide has been submitted. It has been flagged as "Needs Community Verification" until other residents confirm it.',
      [
        {
          text: 'Return',
          onPress: () => router.replace('/(tabs)/knowledge/guides'),
        },
      ]
    );
  };

  // If publishing is locked under current governance parameters, render explainable progress checklist
  if (!evaluation.allowed) {
    const guideUnlock = TrustEngine.getFeatureUnlockRequirements('GB').find((f) => f.featureId === 'guides');
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-white">
        <ScreenHeader title="Publishing Locked" />
        <ScrollView className="flex-1 p-6" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <View className="items-center mb-8">
            <View className="w-20 h-20 bg-amber-50 border border-amber-200 rounded-full items-center justify-center mb-6">
              <Text className="text-4xl">🔒</Text>
            </View>
            <Text className="text-2xl font-black text-neutral-900 text-center mb-3 tracking-tight">
              Publishing Privileges Locked
            </Text>
            <Text className="text-sm text-neutral-500 text-center leading-relaxed max-w-[280px]">
              Publishing is an earned privilege on Diaspora to maintain guide quality standards.
            </Text>
          </View>

          {/* Progress checklists */}
          <View className="bg-neutral-50 border border-neutral-200 rounded-3xl p-5 w-full mb-8">
            <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-4">Requirements Checklist</Text>
            <View className="gap-3">
              {guideUnlock?.requirements.map((r, idx) => (
                <View key={idx} className="flex-row justify-between items-center py-2 border-t border-neutral-100 first:border-t-0">
                  <View className="flex-row items-center flex-1 mr-3">
                    <Text className="text-xs mr-2">{r.isMet ? '✅' : '❌'}</Text>
                    <Text className="text-xs font-extrabold text-neutral-855">{r.description}</Text>
                  </View>
                  <Text className="text-[10px] font-bold text-neutral-500">{r.currentProgress}</Text>
                </View>
              ))}
            </View>
          </View>

          <Button label="Go back to Guides" variant="primary" onPress={() => router.replace('/(tabs)/knowledge/guides')} className="w-full mb-3" />
          <Button label="Visit Trust Center" variant="outline" onPress={() => router.push('/profile/trust-center')} className="w-full" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Explicit Stepper progress bar */}
      <View className="bg-white border-b border-neutral-100 px-6 py-3">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
            Create Community Guide
          </Text>
          <Text className="text-xs font-extrabold text-primary-500">
            Step {currentStep + 1} of {steps.length}
          </Text>
        </View>
        <View className="h-1.5 bg-neutral-100 rounded-full w-full overflow-hidden">
          <View className="h-full bg-primary-500 rounded-full" style={{ width: `${progressPct}%` }} />
        </View>
      </View>

      <ScreenHeader
        title={steps[currentStep]}
        showBack={currentStep > 0}
        rightAction={
          <TouchableOpacity onPress={() => router.replace('/(tabs)/knowledge/guides')} className="p-2">
            <Text className="text-xs font-bold text-neutral-400 uppercase">Save & Exit</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Draft Recovery banner warning */}
        {draftBannerVisible && currentStep === 0 && (
          <View className="bg-[#FFF8E1] border-b border-[#FFE082] px-6 py-4 flex-row items-center justify-between">
            <View className="flex-1 mr-4">
              <Text className="text-sm font-bold text-neutral-800">✏️ Guide Draft Detected</Text>
              <Text className="text-xs text-neutral-600 mt-0.5">
                Restore your previous guide draft?
              </Text>
            </View>
            <View className="flex-row">
              <TouchableOpacity onPress={restoreDraft} className="bg-primary-500 px-3 py-2 rounded-xl mr-2">
                <Text className="text-xs font-bold text-white">Restore</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={discardDraft} className="bg-neutral-100 border border-neutral-200 px-3 py-2 rounded-xl">
                <Text className="text-xs font-bold text-neutral-600">Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <ScrollView className="flex-1 px-6 pt-4" keyboardShouldPersistTaps="handled">
          
          {/* Step 1: Country selector */}
          {currentStep === 0 && (() => {
            const verifiedCountries = mockAuthors['user-123']?.countryVerifications?.filter(v => v.isVerified) || [];
            const selectedCountryObj = verifiedCountries.find(v => v.countryName === selectedCountry);
            return (
              <View className="pb-8" style={{ minHeight: 300 }}>
                <Text className="text-sm text-neutral-500 mb-6 leading-relaxed">
                  Select the country this guide relates to. You can only post guides for countries where you have a verified residency.
                </Text>

                <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-2">Verified Country</Text>

                <View className="relative z-50">
                  <TouchableOpacity
                    activeOpacity={verifiedCountries.length > 1 ? 0.7 : 1}
                    onPress={() => {
                      if (verifiedCountries.length > 1) {
                        setDropdownOpen(!dropdownOpen);
                      }
                    }}
                    className="flex-row items-center justify-between h-14 px-4 bg-neutral-50 border border-neutral-200 rounded-xl"
                  >
                    <View className="flex-row items-center">
                      {selectedCountryObj ? (
                        <>
                          <Text className="text-2xl mr-3">{selectedCountryObj.flag}</Text>
                          <Text className="text-base font-bold text-neutral-900">{selectedCountryObj.countryName}</Text>
                        </>
                      ) : (
                        <Text className="text-base text-neutral-400">Select a country...</Text>
                      )}
                    </View>

                    {verifiedCountries.length > 1 ? (
                      <Text className="text-neutral-500 font-extrabold text-sm">{dropdownOpen ? '▲' : '▼'}</Text>
                    ) : (
                      <View className="flex-row items-center bg-neutral-200/60 px-2.5 py-1 rounded-md">
                        <Text className="text-[10px] font-bold text-neutral-600">🔒 LOCKED</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {dropdownOpen && verifiedCountries.length > 1 && (
                    <View className="absolute top-16 left-0 right-0 bg-white border border-neutral-200 rounded-xl shadow-lg z-50 overflow-hidden">
                      {verifiedCountries.map((c) => (
                        <TouchableOpacity
                          key={c.countryCode}
                          onPress={() => {
                            setSelectedCountry(c.countryName);
                            setDropdownOpen(false);
                          }}
                          className="flex-row items-center py-4 px-4 border-b border-neutral-100 last:border-b-0"
                        >
                          <Text className="text-2xl mr-3">{c.flag}</Text>
                          <Text className="text-base font-bold text-neutral-800 flex-1">{c.countryName}</Text>
                          {selectedCountry === c.countryName && <Text className="text-primary-500 text-lg font-bold">✓</Text>}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {verifiedCountries.length === 1 && (
                  <View className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 mt-6">
                    <Text className="text-xs text-neutral-500 leading-relaxed font-semibold">
                      💡 You only have one verified country of residency ({selectedCountry}). To write guides for other regions, you must first verify your residency in those countries via the Trust Center.
                    </Text>
                  </View>
                )}
              </View>
            );
          })()}

          {/* Step 2: Category Selector */}
          {currentStep === 1 && (
            <View className="pb-8">
              <Text className="text-sm text-neutral-500 mb-6 leading-relaxed">
                Choose the best category so community members can locate your guide under the Knowledge Hub filters.
              </Text>
              <View className="flex-row flex-wrap">
                {mockCategories.map((cat) => {
                  const isSelected = selectedCategory === cat.name;
                  return (
                    <CategoryChip
                      key={cat.id}
                      label={cat.name}
                      icon={cat.icon}
                      isSelected={isSelected}
                      onPress={() => setSelectedCategory(cat.name)}
                    />
                  );
                })}
              </View>
            </View>
          )}

          {/* Step 3: Basics */}
          {currentStep === 2 && (
            <View className="pb-8">
              <Text className="text-sm text-neutral-500 mb-6 leading-relaxed">
                Provide a compelling title and summary. This appears in trending feeds and search lists.
              </Text>

              <Input
                label="Guide Title"
                placeholder="e.g. How to get a Mauritian Work Permit"
                value={title}
                onChangeText={setTitle}
              />

              <Input
                label="Short Summary"
                placeholder="A quick 1-2 sentence preview of what the guide teaches..."
                value={summary}
                onChangeText={setSummary}
                multiline
                numberOfLines={3}
                className="h-20"
              />

              <ImagePickerInput
                label="Cover Photo"
                value={coverImage}
                onChangeImage={setCoverImage}
              />
            </View>
          )}

          {/* Step 4: Rich Text Editor */}
          {currentStep === 3 && (
            <View className="pb-8">
              {/* AI Assistant panel triggers */}
              <View className="flex-row justify-between mb-4">
                <TouchableOpacity onPress={() => triggerAiAction('outline')} className="bg-neutral-100 px-2.5 py-1.5 rounded-lg border border-neutral-200">
                  <Text className="text-[10px] font-extrabold text-neutral-600">🪄 AI Outline</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => triggerAiAction('improve')} className="bg-neutral-100 px-2.5 py-1.5 rounded-lg border border-neutral-200">
                  <Text className="text-[10px] font-extrabold text-neutral-600">✨ AI Improve</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => triggerAiAction('title')} className="bg-neutral-100 px-2.5 py-1.5 rounded-lg border border-neutral-200">
                  <Text className="text-[10px] font-extrabold text-neutral-600">💡 AI Titles</Text>
                </TouchableOpacity>
              </View>

              {/* AI Loading State or Suggestions output */}
              {aiLoading && (
                <View className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 mb-4 flex-row items-center">
                  <ActivityIndicator size="small" color="#FF6B00" className="mr-3" />
                  <Text className="text-xs text-neutral-600 font-medium">{aiLoadingText}</Text>
                </View>
              )}

              {aiSuggestions && (
                <View className="bg-[#FFF8E1] border border-[#FFE082] rounded-2xl p-4 mb-4">
                  <Text className="text-xs text-neutral-700 leading-relaxed font-semibold">{aiSuggestions}</Text>
                  <TouchableOpacity onPress={() => setAiSuggestions(null)} className="mt-2 align-self-end">
                    <Text className="text-[10px] font-bold text-primary-500 uppercase">Dismiss</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Formatting Toolbar */}
              <View className="flex-row items-center border border-neutral-200 bg-neutral-100 rounded-t-2xl p-2.5 gap-2">
                <TouchableOpacity onPress={() => insertTag('tip')} className="bg-white border border-neutral-200 px-2 py-1 rounded">
                  <Text className="text-[10px] font-extrabold text-neutral-700">💡 Tip</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => insertTag('warning')} className="bg-white border border-neutral-200 px-2 py-1 rounded">
                  <Text className="text-[10px] font-extrabold text-neutral-700">⚠️ Warn</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => insertTag('callout')} className="bg-white border border-neutral-200 px-2 py-1 rounded">
                  <Text className="text-[10px] font-extrabold text-neutral-700">💬 Notice</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => insertTag('bullet')} className="bg-white border border-neutral-200 px-2 py-1 rounded">
                  <Text className="text-[10px] font-extrabold text-neutral-700">• List</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => insertTag('link')} className="bg-white border border-neutral-200 px-2 py-1 rounded">
                  <Text className="text-[10px] font-extrabold text-neutral-700">🔗 Link</Text>
                </TouchableOpacity>
              </View>

              {/* Guide Editor Input Text Area */}
              <TextInput
                placeholder="Write your long-form community guide. Use the toolbar above to structure callouts, tips, links and formatting..."
                value={content}
                onChangeText={setContent}
                multiline
                className="bg-white border-x border-b border-neutral-200 rounded-b-2xl p-4 min-h-[160px] text-sm leading-relaxed text-neutral-800"
                placeholderTextColor="#9CA3AF"
                textAlignVertical="top"
              />

              {/* Live Rich Render Preview */}
              <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mt-6 mb-3">Live Rich Editor Preview</Text>
              <View className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200 min-h-[100px]">
                {parseRichPreview(content)}
              </View>
            </View>
          )}

          {/* Step 5: Review & Preview */}
          {currentStep === 4 && (
            <View className="pb-8">
              {/* QA Review stats */}
              <View className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 mb-6">
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Estimated Metrics & QA checks</Text>
                
                <View className="flex-row justify-between mb-2">
                  <Text className="text-xs text-neutral-600 font-semibold">Word Count:</Text>
                  <Text className="text-xs font-bold text-neutral-800">{wordCount} words</Text>
                </View>
                <View className="flex-row justify-between mb-3 border-b border-neutral-100 pb-2">
                  <Text className="text-xs text-neutral-600 font-semibold">Estimated Read Time:</Text>
                  <Text className="text-xs font-bold text-primary-500">{readTimeMin} min read</Text>
                </View>

                {/* AI Review Placeholders */}
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xs text-neutral-500">🤖 AI Grammar Review:</Text>
                  <Text className="text-xs font-extrabold text-success-default bg-[#E6F4EA] px-2 py-0.5 rounded">PASSED</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-neutral-500">🤖 Guide Quality Level:</Text>
                  <Text className="text-xs font-extrabold text-success-default bg-[#E6F4EA] px-2 py-0.5 rounded">EXCELLENT</Text>
                </View>
              </View>

              {/* Published Article View representation */}
              <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Article Layout Representation</Text>
              <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm">
                <Text className="text-xs font-extrabold text-primary-500 uppercase tracking-wider mb-2">
                  {selectedCategory || 'IMMIGRATION'} · {selectedCountry || 'GLOBAL'}
                </Text>
                <Text className="text-xl font-bold text-neutral-900 mb-2 leading-snug">{title || 'Guide Title'}</Text>
                <Text className="text-sm font-semibold text-neutral-500 mb-4 leading-relaxed">{summary || 'Guide summary placeholder...'}</Text>
                
                <View className="border-t border-neutral-50 pt-4">
                  {parseRichPreview(content)}
                </View>
              </View>
            </View>
          )}

        </ScrollView>

        {/* Footer Buttons */}
        <View className="px-6 py-4 border-t border-neutral-100 bg-white">
          <View className="flex-row">
            {currentStep > 0 && (
              <Button
                label="Back"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setCurrentStep(currentStep - 1)}
              />
            )}
            <Button
              label={currentStep === steps.length - 1 ? 'Publish' : 'Next'}
              style={{ flex: 1 }}
              disabled={
                (currentStep === 0 && !selectedCountry) ||
                (currentStep === 1 && !selectedCategory) ||
                (currentStep === 2 && !title) ||
                (currentStep === 3 && !content)
              }
              onPress={() => {
                if (currentStep < steps.length - 1) {
                  setCurrentStep(currentStep + 1);
                } else {
                  handlePublish();
                }
              }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
