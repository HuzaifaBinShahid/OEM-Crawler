import ProfileSection from '../components/profile/ProfileSection';
import ChangePasswordSection from '../components/profile/ChangePasswordSection';

export default function CustomerProfile() {
  return (
    <div className="customer-dashboard customer-profile-page">
      <ProfileSection />
      <ChangePasswordSection />
    </div>
  );
}
