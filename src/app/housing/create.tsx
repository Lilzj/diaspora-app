// This route composes the screen. Each concern is a hook and each part of the page a section,
// in `src/components/screens/housing-create`; the hooks run in the order below and the
// sections read them as props (FSOLID-001).
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { WizardFooter } from '@/components/forms/WizardFooter';
import { DraftBanner } from '@/components/forms/DraftBanner';
import { useNotification } from '@/providers/notification-provider';
import { backOr } from '@/lib/platform/navigation';
import { steps } from '@/components/screens/housing-create/form';
import { useListingAccount } from '@/components/screens/housing-create/useListingAccount';
import { useListingWizard } from '@/components/screens/housing-create/useListingWizard';
import { useHousingDetails } from '@/components/screens/housing-create/useHousingDetails';
import { useHousingLocation } from '@/components/screens/housing-create/useHousingLocation';
import { useHousingPricing } from '@/components/screens/housing-create/useHousingPricing';
import { useHousingPhotos } from '@/components/screens/housing-create/useHousingPhotos';
import {
  useAvailabilityCalendar,
} from '@/components/screens/housing-create/useAvailabilityCalendar';
import { useHousingContact } from '@/components/screens/housing-create/useHousingContact';
import { useHousingAmenities } from '@/components/screens/housing-create/useHousingAmenities';
import { useHousingCatalogue } from '@/components/screens/housing-create/useHousingCatalogue';
import { useListingCheck } from '@/components/screens/housing-create/useListingCheck';
import { useHousingDraft } from '@/components/screens/housing-create/useHousingDraft';
import { useHousingPublish } from '@/components/screens/housing-create/useHousingPublish';
import { useListingProgress } from '@/components/screens/housing-create/useListingProgress';
import { ListingTypeStep } from '@/components/screens/housing-create/ListingTypeStep';
import { PropertyDetailsStep } from '@/components/screens/housing-create/PropertyDetailsStep';
import { LocationStep } from '@/components/screens/housing-create/LocationStep';
import { PricingStep } from '@/components/screens/housing-create/PricingStep';
import { ContactStep } from '@/components/screens/housing-create/ContactStep';
import { PhotosStep } from '@/components/screens/housing-create/PhotosStep';
import { ReviewStep } from '@/components/screens/housing-create/ReviewStep';
import { AvailabilityPicker } from '@/components/screens/housing-create/AvailabilityPicker';

// Remediation Wave E: `MOCK_COVER_PHOTOS` and `MOCK_GALLERY_PHOTOS` stood here —
// two lists of Unsplash URLs that seeded what were supposed to be the member's
// own photographs. They are gone rather than emptied: a property with no
// photograph must look like a property with no photograph, which for a housing
// listing is not a cosmetic point — a member deciding where to live is entitled
// to know they are looking at nothing rather than at somebody else's flat.
export default function CreateHousingScreen() {
  const { showToast } = useNotification();
  const account = useListingAccount();
  const wizard = useListingWizard();
  const details = useHousingDetails();
  const location = useHousingLocation();
  const pricing = useHousingPricing();
  const photos = useHousingPhotos();
  const calendar = useAvailabilityCalendar();
  const contact = useHousingContact();
  const amenities = useHousingAmenities();
  const catalogue = useHousingCatalogue();
  const check = useListingCheck(details, location, pricing, photos, catalogue);
  const draft = useHousingDraft(
    wizard, details, location, pricing, photos, contact, amenities, catalogue,
  );
  const progress = useListingProgress(
    account, wizard, details, location, pricing, photos, contact, catalogue,
  );
  const publish = useHousingPublish(
    account, wizard, details, location, pricing, photos, contact, amenities, catalogue,
  );

  const { mayList } = account;
  const { currentStep, setCurrentStep, isSubmitting } = wizard;
  const { draftBannerVisible, restoreDraft, discardDraft } = draft;
  const { stillNeeded, progressPct } = progress;
  const { handlePublish } = publish;

  if (mayList === false) {
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
        <ScreenHeader title="List a home" />
        <ScrollView className="flex-1 px-6 pt-6">
          <Text className="text-lg font-black text-content-primary mb-2">Listing homes is locked for now</Text>
          <Text className="text-sm text-content-muted mb-5 leading-relaxed">
            Listing a home needs a verified Diaspora account. Once your account is verified, you can
            list straight away.
          </Text>
          <Button label="Open Trust Centre" variant="outline" onPress={() => router.push('/profile/trust-center')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      {/* Stepper tracker */}
      <View className="bg-surface-card border-b border-faint px-6 py-3">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">
            Post Housing Accommodation
          </Text>
          <Text className="text-xs font-extrabold text-primary-500">
            Step {currentStep + 1} of {steps.length}
          </Text>
        </View>
        <View className="h-1.5 bg-surface-muted rounded-full w-full overflow-hidden">
          <View className="h-full bg-primary-500 rounded-full" style={{ width: `${progressPct}%` }} />
        </View>
      </View>

      <ScreenHeader
        title={steps[currentStep]}
        showBack={currentStep > 0}
        rightAction={
          <TouchableOpacity onPress={() => {
              showToast({ type: 'success', title: 'Draft saved', message: 'It is on this phone. Find it in Creator Studio, under Drafts.' });
              backOr();
            }} className="p-2">
            <Text className="text-xs font-bold text-content-faint uppercase">Save & Exit</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
      >
        {/* Draft recover alert banner */}
        {draftBannerVisible && currentStep === 0 && (
          <DraftBanner
            message="Would you like to restore your previously saved housing draft details?"
            onRestore={restoreDraft}
            onDiscard={discardDraft}
          />
        )}

        <ScrollView className="flex-1 px-6 pt-4" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          
          {/* STEP 1: Type Selection */}
          {currentStep === 0 && (
            <ListingTypeStep catalogue={catalogue} />
          )}

          {/* STEP 2: Property details & LIFESTYLE BADGES */}
          {currentStep === 1 && (
            <PropertyDetailsStep amenities={amenities} catalogue={catalogue} details={details} />
          )}

          {/* STEP 3: Location */}
          {currentStep === 2 && (
            <LocationStep account={account} location={location} />
          )}

          {/* STEP 4: Pricing & Availability */}
          {currentStep === 3 && (
            <PricingStep calendar={calendar} catalogue={catalogue} pricing={pricing} />
          )}

          {/* STEP 5: Contact channels */}
          {currentStep === 4 && (
            <ContactStep contact={contact} />
          )}

          {/* STEP 6: Photos */}
          {currentStep === 5 && (
            <PhotosStep photos={photos} />
          )}

          {/* STEP 7: Preview & listing checklist */}
          {currentStep === 6 && (
            <ReviewStep
              catalogue={catalogue}
              check={check}
              details={details}
              location={location}
              pricing={pricing}
            />
          )}

        </ScrollView>

        <WizardFooter
          onBack={currentStep > 0 ? () => setCurrentStep(currentStep - 1) : undefined}
          onNext={() => {
            if (currentStep < steps.length - 1) {
              setCurrentStep(currentStep + 1);
            } else {
              void handlePublish();
            }
          }}
          nextLabel={currentStep === steps.length - 1 ? 'Publish' : 'Next'}
          stillNeeded={stillNeeded}
          isLoading={isSubmitting}
        />
      {/* Calendar Picker Modal */}
      <AvailabilityPicker calendar={calendar} pricing={pricing} />

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
