import React from 'react';
import { KeyboardAvoidingView, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { CurrencyNote } from '@/components/CurrencyNote';
import { DatePickerInput } from '@/components/DatePickerInput';
import { Input } from '@/components/Input';
import { SearchableSelect } from '@/components/forms/SearchableSelect';
import { TownPicker } from '@/components/forms/TownPicker';
import { WizardFooter } from '@/components/forms/WizardFooter';
import { Chips, SectionLabel } from '@/components/jobs/JobFormParts';
import { currencyForResidence } from '@/lib/member-currency';
import { coordinatesOf } from '@/lib/place-coordinates';
import {
  SIMPLE_LENGTH_UNITS,
  SIMPLE_PAY_PER,
  type SimpleJobForm as SimpleJobFormValues,
} from '@/lib/simple-job-posting';

interface SimpleJobFormProps {
  form: SimpleJobFormValues;
  onChange: (next: Partial<SimpleJobFormValues>) => void;
  categoryOptions: { key: string; label: string }[];
  categoriesLoading: boolean;
  today: string;
  stillNeeded: string[];
  problem: string | null;
  isPosting: boolean;
  onPost: () => void;
  /** Opens the full form with what was typed. */
  onMoreOptions: () => void;
  bottomInset: number;
  /** Pay is in the member's own currency, as on the full form. */
  residenceCountry: string | null | undefined;
}

/**
 * A job in one screen (owner's request, 4 Nov 2026): "Two cleaners needed in
 * Port Louis, 200 rupees a day, one day." Members answer it with "I'm
 * interested", which messages the poster, so it asks only what someone needs
 * to decide whether to.
 */
export function SimpleJobForm({
  form,
  onChange,
  categoryOptions,
  categoriesLoading,
  today,
  stillNeeded,
  problem,
  isPosting,
  onPost,
  onMoreOptions,
  bottomInset,
  residenceCountry,
}: SimpleJobFormProps) {
  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1">
      <ScrollView className="flex-1 px-5 pt-2" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text className="text-xs text-content-muted mb-4 leading-relaxed">
          For short work: a day of cleaning, a shift at a hotel, help on a building site. People
          tap &quot;I&apos;m interested&quot; and it lands in your Diaspora messages.
        </Text>

        <Input
          label="What's the job?"
          placeholder="Two cleaners needed"
          value={form.title}
          onChangeText={(title) => onChange({ title })}
          maxLength={200}
          testID="simple-job-title"
        />

        <SectionLabel>Kind of work</SectionLabel>
        <SearchableSelect
          options={categoryOptions}
          value={form.categoryKey}
          onChange={(categoryKey) => onChange({ categoryKey })}
          placeholder="Cleaning, building, hotel…"
          searchPlaceholder="Search kinds of work"
          isLoading={categoriesLoading}
          unavailableMessage="Kinds of work could not be loaded just now."
          testID="simple-job-category"
        />

        <View className="mt-2">
          <Input
            label="How many people"
            placeholder="1"
            value={form.people}
            onChangeText={(people) => onChange({ people })}
            keyboardType="number-pad"
            testID="simple-job-people"
          />
        </View>

        <TownPicker
          label="Where"
          value={form.cityName}
          onChange={(town) => onChange({ cityName: town.cityName, ...coordinatesOf(town) })}
          testID="simple-job-town"
        />

        <Input
          label="Pay"
          placeholder="200"
          value={form.payAmount}
          onChangeText={(payAmount) => onChange({ payAmount })}
          keyboardType="numeric"
          testID="simple-job-pay"
        />
        <CurrencyNote currency={currencyForResidence(residenceCountry)} />
        <View className="mt-3 mb-6">
          <Chips options={SIMPLE_PAY_PER} selected={form.payPer} onSelect={(payPer) => onChange({ payPer })} />
        </View>

        <DatePickerInput
          label="Start date"
          value={form.startsOn}
          onChangeDate={(startsOn) => onChange({ startsOn })}
          minDate={today}
        />

        <View className="mt-4">
          <Input
            label="How long"
            placeholder="1"
            value={form.lengthAmount}
            onChangeText={(lengthAmount) => onChange({ lengthAmount })}
            keyboardType="number-pad"
            testID="simple-job-length"
          />
        </View>
        <View className="mb-6">
          <Chips
            options={SIMPLE_LENGTH_UNITS}
            selected={form.lengthUnit}
            onSelect={(lengthUnit) => onChange({ lengthUnit })}
          />
        </View>

        <Input
          label="Details (optional)"
          placeholder="What to bring, the hours, anything people should know"
          value={form.details}
          onChangeText={(details) => onChange({ details })}
          multiline
          className="h-24 py-3"
          textAlignVertical="top"
          testID="simple-job-details"
        />

        <TouchableOpacity
          accessibilityRole="button"
          onPress={onMoreOptions}
          className="self-start mt-1 mb-10"
          testID="simple-job-more-options"
        >
          <Text className="text-sm font-bold text-primary-600">More options (full job post) →</Text>
          <Text className="text-xs text-content-muted mt-1">
            Experience, workplace, visa sponsorship and applications with a CV.
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <WizardFooter
        onNext={onPost}
        nextLabel="Post job"
        stillNeeded={stillNeeded}
        problem={problem}
        isLoading={isPosting}
        bottomInset={bottomInset}
      />
    </KeyboardAvoidingView>
  );
}
